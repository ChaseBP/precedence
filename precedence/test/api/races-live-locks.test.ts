/**
 * `POST /api/races/live/locks` — recording a lock a lender has already signed.
 *
 * @remarks It takes the transaction hash alone, and that is the entire point of the endpoint. The
 * tranche, the amount, the vault's `seq`, the block and the transaction index are all decoded
 * from the `Lock_` event in that transaction's receipt, so a lender cannot *describe* their own
 * position — only point at it. That is the difference between a proof and a claim, and this route
 * is where the app would have quietly lost it.
 *
 * `(blockNumber, txIndex)` is the priority root. The stored array is kept in that order so the
 * ranking does not depend on a client having sorted it.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { NotVerifiableError } from "../setup";
import {
  FAKE_LENDER_2,
  FAKE_TOKEN,
  FAKE_VAULT,
  resetFakes,
  sepolia,
  txHash,
  vaultState,
  verifiedLock,
} from "../helpers/fakes";
import { freshStore, liveRaceIn, lockRecord, registerFacility } from "../helpers/fixtures";
import { json, post, postRaw } from "../helpers/http";

const route = () => import("@/app/api/races/live/locks/route");

const LOCK_TX = txHash(0x77);

interface Body {
  ok: boolean;
  error?: string;
  id?: string;
  race?: {
    id: string;
    simulated: boolean;
    locks: {
      collateralId: string;
      financier: string;
      financierAddress: string;
      tranche: string;
      amountUsd: number;
      lockBlockNumber: number;
      lockTxIndex: number;
      seq: number;
      token: string;
      sepoliaTxHash: string;
      receiptStatus: number;
      emittedBy: string;
      refunded: boolean;
    }[];
    onchain?: { openTxHash?: string; raceNonce: number; openBlockNumber: number };
  };
}

async function lock(body: unknown) {
  const { POST } = await route();
  return json<Body>(await POST(post("/api/races/live/locks", body)));
}

describe("POST /api/races/live/locks", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  describe("the request", () => {
    test("400s with no collateralId", async () => {
      const { status, body } = await lock({ lockTxHash: LOCK_TX });
      expect(status).toBe(400);
      expect(body.error).toBe("collateralId and lockTxHash are required");
    });

    test("400s with no lockTxHash", async () => {
      const { status } = await lock({ collateralId: "col-live" });
      expect(status).toBe(400);
    });

    test("400s with neither", async () => {
      const { status } = await lock({});
      expect(status).toBe(400);
    });

    test("400s on a body that is not JSON", async () => {
      const { POST } = await route();
      const res = await POST(postRaw("/api/races/live/locks", "nope"));
      expect(res.status).toBe(400);
    });

    test("400s on an empty lockTxHash", async () => {
      const { status } = await lock({ collateralId: "col-live", lockTxHash: "" });
      expect(status).toBe(400);
    });
  });

  describe("the happy path", () => {
    test("answers 201", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      const { status } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(status).toBe(201);
    });

    test("records exactly one lock", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.locks).toHaveLength(1);
    });

    test("takes the block and index from the receipt, not from the caller", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      sepolia.verifyLock = async () => verifiedLock({ blockNumber: 9_111_222, txIndex: 71 });
      const { body } = await lock({
        collateralId: col.id,
        lockTxHash: LOCK_TX,
        // Ignored: a lender describing their own position is exactly what this refuses.
        lockBlockNumber: 1,
        lockTxIndex: 0,
      });
      expect(body.race?.locks[0].lockBlockNumber).toBe(9_111_222);
      expect(body.race?.locks[0].lockTxIndex).toBe(71);
    });

    test("takes the tranche from the event, not from the caller", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      sepolia.verifyLock = async () => verifiedLock({ tranche: "JUNIOR" });
      const { body } = await lock({
        collateralId: col.id,
        lockTxHash: LOCK_TX,
        tranche: "SENIOR",
      });
      expect(body.race?.locks[0].tranche).toBe("JUNIOR");
    });

    test("takes the amount from the event", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      sepolia.verifyLock = async () => verifiedLock({ amountUsd: 12_345 });
      const { body } = await lock({
        collateralId: col.id,
        lockTxHash: LOCK_TX,
        amountUsd: 999_999,
      });
      expect(body.race?.locks[0].amountUsd).toBe(12_345);
    });

    test("takes the vault's own seq, which is what proves the set is complete", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      sepolia.verifyLock = async () => verifiedLock({ seq: 4 });
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX, seq: 1 });
      expect(body.race?.locks[0].seq).toBe(4);
    });

    test("names the wallet that signed it, because a live lock has no agent behind it", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      sepolia.verifyLock = async () => verifiedLock({ financier: FAKE_LENDER_2 });
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.locks[0].financier).toBe(FAKE_LENDER_2);
      expect(body.race?.locks[0].financierAddress).toBe(FAKE_LENDER_2);
    });

    test("never attributes a stranger's capital to a house financier", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(["meridian", "vector", "novum", "kestrel"]).not.toContain(
        body.race?.locks[0].financier,
      );
    });

    test("carries the settlement token, so Creditcoin never infers denomination", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.locks[0].token).toBe(FAKE_TOKEN);
    });

    test("records the vault that emitted the event", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.locks[0].emittedBy).toBe(FAKE_VAULT);
    });

    test("asserts a successful receipt, which the verifier already refused otherwise", async () => {
      // The precompile does not check `receipt.status`; the dApp must, and does — in `verifyLock`.
      const col = await registerFacility();
      await liveRaceIn(col);
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.locks[0].receiptStatus).toBe(1);
    });

    test("records the lock as not refunded", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.locks[0].refunded).toBe(false);
    });

    test("ties the lock to the facility slug, not the document hash", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.locks[0].collateralId).toBe(col.id);
    });

    test("keeps the race not simulated", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.simulated).toBe(false);
    });

    test("persists the lock", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col);
      await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      const repos = await import("@/lib/precedence/store/repositories");
      expect((await repos.getRace(race.id))?.locks).toHaveLength(1);
    });
  });

  describe("idempotency", () => {
    test("records one lock when the same transaction is submitted twice", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      sepolia.verifyLock = async () => verifiedLock({ txHash: LOCK_TX });
      await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.locks).toHaveLength(1);
    });

    test("is case-insensitive about the hash", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      sepolia.verifyLock = async () => verifiedLock({ txHash: LOCK_TX });
      await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      sepolia.verifyLock = async () =>
        verifiedLock({ txHash: LOCK_TX.toUpperCase().replace("0X", "0x") as never });
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.locks).toHaveLength(1);
    });

    test("still records two genuinely different locks", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      sepolia.verifyLock = async () => verifiedLock({ txHash: txHash(1), txIndex: 71, seq: 1 });
      await lock({ collateralId: col.id, lockTxHash: txHash(1) });
      sepolia.verifyLock = async () =>
        verifiedLock({ txHash: txHash(2), txIndex: 72, seq: 2, financier: FAKE_LENDER_2 });
      const { body } = await lock({ collateralId: col.id, lockTxHash: txHash(2) });
      expect(body.race?.locks).toHaveLength(2);
    });
  });

  describe("ordering — the stored array is already in rank order", () => {
    test("orders two locks in the same block by transaction index", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      // The later index arrives first, so a route that appended blindly would rank it senior.
      sepolia.verifyLock = async () => verifiedLock({ txHash: txHash(2), txIndex: 72, seq: 2 });
      await lock({ collateralId: col.id, lockTxHash: txHash(2) });
      sepolia.verifyLock = async () => verifiedLock({ txHash: txHash(1), txIndex: 71, seq: 1 });
      const { body } = await lock({ collateralId: col.id, lockTxHash: txHash(1) });
      expect(body.race?.locks.map((l) => l.lockTxIndex)).toEqual([71, 72]);
    });

    test("orders by block first", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      sepolia.verifyLock = async () =>
        verifiedLock({ txHash: txHash(2), blockNumber: 9_000_020, txIndex: 3, seq: 2 });
      await lock({ collateralId: col.id, lockTxHash: txHash(2) });
      sepolia.verifyLock = async () =>
        verifiedLock({ txHash: txHash(1), blockNumber: 9_000_010, txIndex: 900, seq: 1 });
      const { body } = await lock({ collateralId: col.id, lockTxHash: txHash(1) });
      expect(body.race?.locks.map((l) => l.lockBlockNumber)).toEqual([9_000_010, 9_000_020]);
    });

    test("resolves a same-block tie, which is the case the protocol exists for", async () => {
      const col = await registerFacility();
      await liveRaceIn(col);
      for (const [i, idx] of [71, 72, 73].entries()) {
        sepolia.verifyLock = async () =>
          verifiedLock({ txHash: txHash(10 + i), blockNumber: 9_000_010, txIndex: idx, seq: i + 1 });
        await lock({ collateralId: col.id, lockTxHash: txHash(10 + i) });
      }
      const repos = await import("@/lib/precedence/store/repositories");
      const race = (await repos.getRace(`live-${col.docHash.slice(2, 10)}-1`))!;
      expect(new Set(race.locks.map((l) => l.lockBlockNumber)).size).toBe(1);
      expect(race.locks.map((l) => l.lockTxIndex)).toEqual([71, 72, 73]);
    });

    test("re-sorts when an earlier lock is recorded after a later one", async () => {
      const col = await registerFacility();
      await liveRaceIn(col, { locks: [lockRecord({ lockTxIndex: 80, seq: 2 })] });
      sepolia.verifyLock = async () => verifiedLock({ txHash: txHash(5), txIndex: 12, seq: 1 });
      const { body } = await lock({ collateralId: col.id, lockTxHash: txHash(5) });
      expect(body.race?.locks[0].lockTxIndex).toBe(12);
    });
  });

  describe("a lock that arrives before the app knows about the race", () => {
    test("recovers the race rather than dropping a real lock", async () => {
      const col = await registerFacility();
      const { status, body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(status).toBe(201);
      expect(body.race?.locks).toHaveLength(1);
    });

    test("leaves the opening transaction unset rather than using the lock's hash", async () => {
      // Putting the lock's hash there would label a real transaction as something it is not.
      const col = await registerFacility();
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.onchain?.openTxHash).toBeUndefined();
    });

    test("takes the race nonce from the lock's own event", async () => {
      const col = await registerFacility();
      sepolia.verifyLock = async () => verifiedLock({ raceNonce: 3 });
      sepolia.raceState = async () => vaultState({ raceNonce: 3 });
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.onchain?.raceNonce).toBe(3);
    });

    test("uses the lock's block as the opening block", async () => {
      const col = await registerFacility();
      sepolia.verifyLock = async () => verifiedLock({ blockNumber: 9_222_333 });
      const { body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(body.race?.onchain?.openBlockNumber).toBe(9_222_333);
    });

    test("422s a lock from a race the vault has moved on from", async () => {
      const col = await registerFacility();
      sepolia.verifyLock = async () => verifiedLock({ raceNonce: 1 });
      sepolia.raceState = async () => vaultState({ raceNonce: 5 });
      const { status, body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(status).toBe(422);
      expect(body.error).toContain("belongs to race 1");
      expect(body.error).toContain("on race 5");
    });

    test("appends to an existing race with the matching nonce instead", async () => {
      const col = await registerFacility();
      await liveRaceIn(col, { locks: [lockRecord({ seq: 1 })] }, { raceNonce: 1 });
      sepolia.verifyLock = async () =>
        verifiedLock({ txHash: txHash(9), seq: 2, txIndex: 90, raceNonce: 1 });
      const { body } = await lock({ collateralId: col.id, lockTxHash: txHash(9) });
      expect(body.race?.locks).toHaveLength(2);
    });

    test("does not append to a race with a different nonce", async () => {
      const col = await registerFacility();
      await liveRaceIn(col, { locks: [lockRecord({ seq: 1 })] }, { raceNonce: 1 });
      sepolia.verifyLock = async () => verifiedLock({ raceNonce: 2, txHash: txHash(9) });
      sepolia.raceState = async () => vaultState({ raceNonce: 2 });
      const { body } = await lock({ collateralId: col.id, lockTxHash: txHash(9) });
      expect(body.race?.locks).toHaveLength(1);
      expect(body.race?.onchain?.raceNonce).toBe(2);
    });
  });

  describe("refusals", () => {
    test("422s collateral that is not on record", async () => {
      const { status, body } = await lock({ collateralId: "col-ghost", lockTxHash: LOCK_TX });
      expect(status).toBe(422);
      expect(body.error).toContain("is on record");
    });

    test("422s when the transaction emitted no lock for this facility", async () => {
      const col = await registerFacility();
      sepolia.verifyLock = async () => {
        throw new NotVerifiableError("that transaction emitted no Lock_ for this collateral");
      };
      const { status, body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(status).toBe(422);
      expect(body.error).toContain("emitted no Lock_");
    });

    test("422s when no vault is deployed to verify against", async () => {
      const col = await registerFacility();
      sepolia.why = "no Sepolia vault is deployed";
      const { status, body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(status).toBe(422);
      expect(body.error).toContain("no Sepolia vault is deployed");
    });

    test("502s when the chain could not be reached", async () => {
      const col = await registerFacility();
      sepolia.verifyLock = async () => {
        throw new Error("ETIMEDOUT");
      };
      const { status, body } = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(status).toBe(502);
      expect(body.error).toContain("ETIMEDOUT");
    });

    test("stores nothing when it refuses", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col);
      sepolia.verifyLock = async () => {
        throw new NotVerifiableError("no");
      };
      await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      const repos = await import("@/lib/precedence/store/repositories");
      expect((await repos.getRace(race.id))?.locks).toEqual([]);
    });

    test("keeps the two failure classes on different statuses", async () => {
      const col = await registerFacility();
      sepolia.verifyLock = async () => {
        throw new NotVerifiableError("answered");
      };
      const a = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      sepolia.verifyLock = async () => {
        throw new Error("unreachable");
      };
      const b = await lock({ collateralId: col.id, lockTxHash: LOCK_TX });
      expect(a.status).toBe(422);
      expect(b.status).toBe(502);
    });
  });
});
