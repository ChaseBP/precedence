/**
 * `GET|POST /api/races/live` — recording a race that exists on the Sepolia vault.
 *
 * @remarks The whole design of this route is in what it refuses to accept. It would be far
 * simpler to take the block number and transaction index the browser already holds — it read them
 * off the receipt itself — but those two numbers *are* the priority claim, so accepting them from
 * the party they rank would leave the app with no proof of anything. It takes a transaction hash
 * and decodes the rest server-side.
 *
 * The status codes carry a real distinction. 422 means the chain answered and does not support the
 * claim; 502 means we could not ask it. A caller retrying is right in the second case and wrong in
 * the first, so collapsing them would leave someone submitting a stranger's receipt retrying
 * forever against a server they were told had a problem.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { NotVerifiableError } from "../setup";
import {
  FAKE_OBLIGOR,
  FAKE_VAULT,
  OTHER_DOC_HASH,
  REAL_DOC_HASH,
  resetFakes,
  sepolia,
  txHash,
  vaultState,
  verifiedOpen,
} from "../helpers/fakes";
import { freshStore, lockRecord, registerFacility } from "../helpers/fixtures";
import { get, json, post, postRaw } from "../helpers/http";

const route = () => import("@/app/api/races/live/route");

const OPEN_TX = txHash(0xaa);

interface Body {
  ok: boolean;
  error?: string;
  id?: string | null;
  recovered?: boolean;
  race?: {
    id: string;
    simulated: boolean;
    status: string;
    track: string;
    scenario: string;
    createdAt: string;
    updatedAt: string;
    locks: { lockBlockNumber: number; lockTxIndex: number; seq: number }[];
    requestedTotalUsd: number;
    onchain?: {
      chainId: number;
      vaultAddress: string;
      collateralId: string;
      obligor: string;
      openTxHash?: string;
      registerTxHash?: string;
      openBlockNumber: number;
      raceNonce: number;
      raceDeadline: number;
      facilitySizeUsd: number;
      creditcoinRegisterTx?: string;
      creditcoinTermsTx?: string;
    };
  } | null;
}

async function look(query: string) {
  const { GET } = await route();
  return json<Body>(await GET(get(`/api/races/live${query}`)));
}

async function open(body: unknown) {
  const { POST } = await route();
  return json<Body>(await POST(post("/api/races/live", body)));
}

describe("GET /api/races/live", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("400s with no collateralId", async () => {
    const { status, body } = await look("");
    expect(status).toBe(400);
    expect(body.error).toBe("collateralId is required");
  });

  test("400s on an empty collateralId", async () => {
    const { status } = await look("?collateralId=");
    expect(status).toBe(400);
  });

  test("404s for collateral that is not on record", async () => {
    const { status, body } = await look("?collateralId=col-nope");
    expect(status).toBe(404);
    expect(body.error).toBe("no such collateral");
  });

  test("reports no race rather than 404ing when none has been opened", async () => {
    const col = await registerFacility();
    const { status, body } = await look(`?collateralId=${col.id}`);
    expect(status).toBe(200);
    expect(body.race).toBeNull();
    expect(body.id).toBeNull();
  });

  test("finds a race that has been opened", async () => {
    const col = await registerFacility();
    await open({ collateralId: col.id, openTxHash: OPEN_TX });
    const { body } = await look(`?collateralId=${col.id}`);
    expect(body.race?.onchain?.raceNonce).toBe(1);
  });

  test("finds it by symbol too", async () => {
    const col = await registerFacility();
    await open({ collateralId: col.id, openTxHash: OPEN_TX });
    const { body } = await look(`?collateralId=${col.symbol}`);
    expect(body.race).not.toBeNull();
  });

  test("returns the race id beside the race", async () => {
    const col = await registerFacility();
    await open({ collateralId: col.id, openTxHash: OPEN_TX });
    const { body } = await look(`?collateralId=${col.id}`);
    expect(body.id).toBe(body.race?.id);
  });

  test("prefers the most recent nonce, because an older race is history", async () => {
    const col = await registerFacility();
    await open({ collateralId: col.id, openTxHash: OPEN_TX });
    sepolia.verifyRaceOpen = async () => verifiedOpen({ raceNonce: 2, txHash: txHash(0xbb) });
    sepolia.raceState = async () => vaultState({ raceNonce: 2 });
    await open({ collateralId: col.id, openTxHash: txHash(0xbb) });
    const { body } = await look(`?collateralId=${col.id}`);
    expect(body.race?.onchain?.raceNonce).toBe(2);
  });

  test("does not return another facility's race", async () => {
    const mine = await registerFacility();
    await open({ collateralId: mine.id, openTxHash: OPEN_TX });
    const other = await registerFacility({
      id: "col-other",
      symbol: "OTHER-1",
      docHash: OTHER_DOC_HASH,
    });
    const { body } = await look(`?collateralId=${other.id}`);
    expect(body.race).toBeNull();
  });

  test("does not confuse a scripted race with a live one", async () => {
    const col = await registerFacility();
    const { scriptedRaceIn } = await import("../helpers/fixtures");
    await scriptedRaceIn(col);
    const { body } = await look(`?collateralId=${col.id}`);
    expect(body.race).toBeNull();
  });
});

describe("POST /api/races/live — opening", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  describe("the request", () => {
    test("400s with no collateralId", async () => {
      const { status, body } = await open({ openTxHash: OPEN_TX });
      expect(status).toBe(400);
      expect(body.error).toBe("collateralId is required");
    });

    test("400s with no openTxHash and no recovery", async () => {
      const col = await registerFacility();
      const { status, body } = await open({ collateralId: col.id });
      expect(status).toBe(400);
      expect(body.error).toContain("openTxHash is required unless recovering");
    });

    test("400s on a body that is not JSON", async () => {
      const { POST } = await route();
      const { status } = await json<Body>(await POST(postRaw("/api/races/live", "{{{")));
      expect(status).toBe(400);
    });

    test("400s on no body at all", async () => {
      const { POST } = await route();
      const res = await POST(new Request("http://t/api/races/live", { method: "POST" }));
      expect(res.status).toBe(400);
    });
  });

  describe("the happy path", () => {
    test("answers 201", async () => {
      const col = await registerFacility();
      const { status } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(status).toBe(201);
    });

    test("marks the race not simulated — the only place in the app that does", async () => {
      const col = await registerFacility();
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.simulated).toBe(false);
    });

    test("stops at RACE_OPEN, because priority is not settled until a proof exists", async () => {
      const col = await registerFacility();
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.status).toBe("RACE_OPEN");
    });

    test("starts with no locks", async () => {
      const col = await registerFacility();
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.locks).toEqual([]);
    });

    test("records the vault it read, not one the caller named", async () => {
      const col = await registerFacility();
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.onchain?.vaultAddress).toBe(FAKE_VAULT);
    });

    test("records the obligor from vault storage", async () => {
      const col = await registerFacility();
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.onchain?.obligor).toBe(FAKE_OBLIGOR);
    });

    test("identifies the race by the document hash, not the facility slug", async () => {
      const col = await registerFacility();
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.onchain?.collateralId).toBe(REAL_DOC_HASH);
    });

    test("names Sepolia's chain id", async () => {
      const col = await registerFacility();
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.onchain?.chainId).toBe(11155111);
    });

    test("takes the block and nonce from the decoded event", async () => {
      const col = await registerFacility();
      sepolia.verifyRaceOpen = async () =>
        verifiedOpen({ blockNumber: 9_123_456, raceNonce: 3, txHash: OPEN_TX });
      sepolia.raceState = async () => vaultState({ raceNonce: 3 });
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.onchain?.openBlockNumber).toBe(9_123_456);
      expect(body.race?.onchain?.raceNonce).toBe(3);
    });

    test("takes the facility size from the event, not from the facility record", async () => {
      const col = await registerFacility();
      sepolia.verifyRaceOpen = async () => verifiedOpen({ facilitySizeUsd: 77_000 });
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.onchain?.facilitySizeUsd).toBe(77_000);
      expect(body.race?.requestedTotalUsd).toBe(77_000);
    });

    test("records the opening transaction it verified", async () => {
      const col = await registerFacility();
      sepolia.verifyRaceOpen = async () => verifiedOpen({ txHash: OPEN_TX });
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.onchain?.openTxHash).toBe(OPEN_TX);
    });

    test("records the hash it VERIFIED, not the one it was handed", async () => {
      // The receipt is the evidence. If the two ever disagree, the verified one is the fact, and
      // storing the submitted one would put a caller-supplied string behind an explorer link.
      const col = await registerFacility();
      const verified = txHash(0x5e);
      sepolia.verifyRaceOpen = async () => verifiedOpen({ txHash: verified });
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.onchain?.openTxHash).toBe(verified);
    });

    test("records the registration transaction when the caller sent that too", async () => {
      const col = await registerFacility();
      const registerTx = txHash(0xcc);
      const { body } = await open({
        collateralId: col.id,
        openTxHash: OPEN_TX,
        registerTxHash: registerTx,
      });
      expect(body.race?.onchain?.registerTxHash).toBe(registerTx);
    });

    test("leaves the registration transaction unset when none was given", async () => {
      const col = await registerFacility();
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.onchain?.registerTxHash).toBeUndefined();
    });

    test("carries the facility's Creditcoin receipts onto the race", async () => {
      const registerTx = txHash(0x11);
      const termsTx = txHash(0x22);
      const col = await registerFacility({
        onChainRefs: { creditcoinRegisterTx: registerTx, creditcoinTermsTx: termsTx },
      });
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.race?.onchain?.creditcoinRegisterTx).toBe(registerTx);
      expect(body.race?.onchain?.creditcoinTermsTx).toBe(termsTx);
    });

    test("moves the facility to RACE_OPEN so its guards agree with the vault", async () => {
      const col = await registerFacility();
      await open({ collateralId: col.id, openTxHash: OPEN_TX });
      const repos = await import("@/lib/precedence/store/repositories");
      expect((await repos.getCollateral(col.id))?.status).toBe("RACE_OPEN");
    });

    test("is idempotent by (collateral, nonce) — a double submit records one race", async () => {
      const col = await registerFacility();
      const first = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      const second = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(second.body.race?.id).toBe(first.body.race?.id);
      const repos = await import("@/lib/precedence/store/repositories");
      expect(await repos.listRacesFull()).toHaveLength(2); // the seeded race, plus this one
    });

    test("returns the existing race unchanged on a retry", async () => {
      const col = await registerFacility();
      const first = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      const second = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(second.body.race?.createdAt ?? null).toBe(first.body.race?.createdAt ?? null);
    });
  });

  describe("what the chain refuses", () => {
    test("422s a facility whose document hash is a visible placeholder", async () => {
      // Every seeded facility carries one, and no vault position can exist for it.
      const { status, body } = await open({ collateralId: "col-8802", openTxHash: OPEN_TX });
      expect(status).toBe(422);
      expect(body.error).toContain("placeholder");
    });

    test("422s collateral that is not on record", async () => {
      const { status, body } = await open({ collateralId: "col-ghost", openTxHash: OPEN_TX });
      expect(status).toBe(422);
      expect(body.error).toContain("is on record");
    });

    test("422s when the transaction did not open a race on this vault", async () => {
      const col = await registerFacility();
      sepolia.verifyRaceOpen = async () => {
        throw new NotVerifiableError("that transaction emitted no RaceOpened for this facility");
      };
      const { status, body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(status).toBe(422);
      expect(body.error).toContain("emitted no RaceOpened");
    });

    test("422s when the vault does not have the collateral registered", async () => {
      const col = await registerFacility();
      sepolia.raceState = async () => vaultState({ registered: false });
      const { status, body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(status).toBe(422);
      expect(body.error).toContain("does not have this collateral registered");
    });

    test("422s a stale receipt from a superseded race", async () => {
      const col = await registerFacility();
      sepolia.verifyRaceOpen = async () => verifiedOpen({ raceNonce: 1 });
      sepolia.raceState = async () => vaultState({ raceNonce: 4 });
      const { status, body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(status).toBe(422);
      expect(body.error).toContain("superseded");
    });

    test("names both nonces so the caller can see what happened", async () => {
      const col = await registerFacility();
      sepolia.verifyRaceOpen = async () => verifiedOpen({ raceNonce: 1 });
      sepolia.raceState = async () => vaultState({ raceNonce: 4 });
      const { body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(body.error).toContain("race 1");
      expect(body.error).toContain("race 4");
    });

    test("422s when no vault is deployed to verify against", async () => {
      const col = await registerFacility();
      sepolia.why = "contracts/deployments/sepolia.json is missing";
      const { status, body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(status).toBe(422);
      expect(body.error).toContain("sepolia.json is missing");
    });

    test("stores nothing when it refuses", async () => {
      const col = await registerFacility();
      sepolia.raceState = async () => vaultState({ registered: false });
      await open({ collateralId: col.id, openTxHash: OPEN_TX });
      const repos = await import("@/lib/precedence/store/repositories");
      expect(await repos.listRacesFull()).toHaveLength(1);
    });
  });

  describe("what we could not ask", () => {
    test("502s a transport failure rather than 422", async () => {
      const col = await registerFacility();
      sepolia.verifyRaceOpen = async () => {
        throw new Error("fetch failed");
      };
      const { status } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(status).toBe(502);
    });

    test("502s a vault read that failed", async () => {
      const col = await registerFacility();
      sepolia.raceState = async () => {
        throw new Error("upstream 429");
      };
      const { status, body } = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(status).toBe(502);
      expect(body.error).toContain("429");
    });

    test("keeps 422 and 502 distinct, because retrying is right in only one", async () => {
      const col = await registerFacility();
      sepolia.verifyRaceOpen = async () => {
        throw new NotVerifiableError("no");
      };
      const answered = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      sepolia.verifyRaceOpen = async () => {
        throw new Error("no");
      };
      const unreachable = await open({ collateralId: col.id, openTxHash: OPEN_TX });
      expect(answered.status).not.toBe(unreachable.status);
    });
  });
});

describe("POST /api/races/live — recovering from the chain", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("needs no transaction hash, because nothing is being claimed", async () => {
    const col = await registerFacility();
    sepolia.raceState = async () => vaultState({ raceNonce: 2, raceOpen: false });
    const { status } = await open({ collateralId: col.id, recover: true });
    expect(status).toBe(200);
  });

  test("answers 200 rather than 201 — this is not a new record", async () => {
    const col = await registerFacility();
    sepolia.raceState = async () => vaultState({ raceNonce: 2 });
    const { status, body } = await open({ collateralId: col.id, recover: true });
    expect(status).toBe(200);
    expect(body.recovered).toBe(true);
  });

  test("rebuilds the race from vault storage", async () => {
    const col = await registerFacility();
    sepolia.raceState = async () =>
      vaultState({ raceNonce: 5, facilitySizeUsd: 55_000, raceDeadline: 1_800_000_000 });
    const { body } = await open({ collateralId: col.id, recover: true });
    expect(body.race?.onchain?.raceNonce).toBe(5);
    expect(body.race?.onchain?.facilitySizeUsd).toBe(55_000);
    expect(body.race?.onchain?.raceDeadline).toBe(1_800_000_000);
  });

  test("recovers the locks the vault holds", async () => {
    const col = await registerFacility();
    sepolia.raceState = async () => vaultState({ raceNonce: 1 });
    sepolia.locksFromChain = async () => [
      lockRecord({ seq: 1, lockBlockNumber: 9_000_010, lockTxIndex: 71 }),
      lockRecord({ seq: 2, lockBlockNumber: 9_000_010, lockTxIndex: 72, sepoliaTxHash: txHash(3) }),
    ];
    const { body } = await open({ collateralId: col.id, recover: true });
    expect(body.race?.locks).toHaveLength(2);
  });

  test("leaves the opening transaction unset, because storage does not hold it", async () => {
    const col = await registerFacility();
    sepolia.raceState = async () => vaultState({ raceNonce: 1 });
    const { body } = await open({ collateralId: col.id, recover: true });
    expect(body.race?.onchain?.openTxHash).toBeUndefined();
  });

  test("infers the opening block from the earliest lock", async () => {
    const col = await registerFacility();
    sepolia.raceState = async () => vaultState({ raceNonce: 1 });
    sepolia.locksFromChain = async () => [
      lockRecord({ seq: 1, lockBlockNumber: 9_000_050 }),
      lockRecord({ seq: 2, lockBlockNumber: 9_000_020, sepoliaTxHash: txHash(3) }),
    ];
    const { body } = await open({ collateralId: col.id, recover: true });
    expect(body.race?.onchain?.openBlockNumber).toBe(9_000_020);
  });

  test("uses zero for the opening block when there are no locks yet", async () => {
    const col = await registerFacility();
    sepolia.raceState = async () => vaultState({ raceNonce: 1 });
    const { body } = await open({ collateralId: col.id, recover: true });
    expect(body.race?.onchain?.openBlockNumber).toBe(0);
  });

  test("422s a facility the vault has never seen", async () => {
    const col = await registerFacility();
    sepolia.raceState = async () => vaultState({ registered: false });
    const { status, body } = await open({ collateralId: col.id, recover: true });
    expect(status).toBe(422);
    expect(body.error).toContain("never seen this document");
  });

  test("422s when no race has ever been opened", async () => {
    const col = await registerFacility();
    sepolia.raceState = async () => vaultState({ raceNonce: 0 });
    const { status, body } = await open({ collateralId: col.id, recover: true });
    expect(status).toBe(422);
    expect(body.error).toContain("No race has ever been opened");
  });

  test("422s a placeholder document hash", async () => {
    const { status, body } = await open({ collateralId: "col-8802", recover: true });
    expect(status).toBe(422);
    expect(body.error).toContain("placeholder");
  });

  test("502s when the vault could not be read", async () => {
    const col = await registerFacility();
    sepolia.raceState = async () => {
      throw new Error("rpc down");
    };
    const { status } = await open({ collateralId: col.id, recover: true });
    expect(status).toBe(502);
  });

  test("updates an existing race rather than creating a second one", async () => {
    const col = await registerFacility();
    await open({ collateralId: col.id, openTxHash: OPEN_TX });
    sepolia.locksFromChain = async () => [lockRecord({ seq: 1 })];
    await open({ collateralId: col.id, recover: true });
    const repos = await import("@/lib/precedence/store/repositories");
    const live = (await repos.listRacesFull()).filter((r) => r.simulated === false);
    expect(live).toHaveLength(1);
    expect(live[0].locks).toHaveLength(1);
  });

  test("keeps the opening transaction it already knew", async () => {
    const col = await registerFacility();
    sepolia.verifyRaceOpen = async () => verifiedOpen({ txHash: OPEN_TX });
    await open({ collateralId: col.id, openTxHash: OPEN_TX });
    const { body } = await open({ collateralId: col.id, recover: true });
    expect(body.race?.onchain?.openTxHash).toBe(OPEN_TX);
  });

  test("moves a CLEAR facility to RACE_OPEN but does not demote a later status", async () => {
    const col = await registerFacility({ status: "ENCUMBERED" });
    sepolia.raceState = async () => vaultState({ raceNonce: 1 });
    await open({ collateralId: col.id, recover: true });
    const repos = await import("@/lib/precedence/store/repositories");
    expect((await repos.getCollateral(col.id))?.status).toBe("ENCUMBERED");
  });

  test("ignores openTxHash when recovering", async () => {
    const col = await registerFacility();
    sepolia.raceState = async () => vaultState({ raceNonce: 7 });
    const { body } = await open({ collateralId: col.id, recover: true, openTxHash: OPEN_TX });
    expect(body.race?.onchain?.raceNonce).toBe(7);
    expect(body.race?.onchain?.openTxHash).toBeUndefined();
  });
});
