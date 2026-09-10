/**
 * `GET /api/races/live/status` — what a live settlement is waiting for, right now.
 *
 * @remarks This endpoint exists because "is this stuck?" had no answer on screen. A settlement sat
 * on a pending state with a measured 6.5–9.3 minute range beside it and nothing that changed, and
 * there was no way to tell a settlement progressing normally from one that had nothing left to
 * progress it. Those look identical and need completely different actions.
 *
 * So `stage` is the thing under test, and it is derived from chain reads and never from the stored
 * phase. The store is a cache of what we believe; the vault and the precompile are what a proof
 * will actually attest to. AWAITING_CLOSE is the stage that surprises people — a deadline passing
 * does not close a race, somebody has to send `closeRace`, and after the deadline anybody may.
 *
 * The settled branch is deliberately cheaper: a proven settlement is finished and asking the
 * chains again cannot change any of those numbers, so it answers from the record plus one vault
 * read. Without that a settled race answered five RPC calls per poll, forever, to redisplay
 * figures that could not move.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import {
  attest,
  frontier,
  liveRace,
  prover,
  proverJob,
  resetFakes,
  sepolia,
  txHash,
  vaultState,
} from "../helpers/fakes";
import {
  freshStore,
  liveRaceIn,
  lockRecord,
  registerFacility,
  scriptedRaceIn,
  settlementRecord,
} from "../helpers/fixtures";
import { get, json } from "../helpers/http";

const route = () => import("@/app/api/races/live/status/route");

interface Body {
  ok: boolean;
  error?: string;
  id?: string;
  stage?: string;
  vault?: {
    raceOpen: boolean;
    raceNonce: number;
    lockCount: number;
    totalLockedUsd: number;
    facilitySizeUsd: number;
    raceDeadline: number;
    secondsLeft: number;
    obligor: string;
    closableByAnyone: boolean;
    totalDrawnUsd: number;
    totalRepaidUsd: number;
    drawDeadline: number;
  };
  attestation?: {
    chainKey: number;
    attestedHeight: number;
    checkpointHeight: number;
    sepoliaHead: number;
    lagBlocks: number;
    targetHeight: number;
    targetAttested: boolean;
    blocksToGo: number;
  };
  proverCommand?: string;
  prover?: {
    available: boolean;
    unavailableReason?: string;
    job?: { state: string; stage: string; error?: string; log: string[] };
  };
}

async function poll(id: string) {
  const { GET } = await route();
  return json<Body>(await GET(get(`/api/races/live/status?id=${id}`)));
}

/** A live race with one lock at block 9,000,010. */
async function live(over = {}, onchainOver = {}) {
  const col = await registerFacility();
  return liveRaceIn(col, { locks: [lockRecord()], ...over }, onchainOver);
}

const now = () => Math.floor(Date.now() / 1000);

describe("GET /api/races/live/status", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  describe("the request", () => {
    test("400s with no id", async () => {
      const { GET } = await route();
      const { status, body } = await json<Body>(await GET(get("/api/races/live/status")));
      expect(status).toBe(400);
      expect(body.error).toBe("id is required");
    });

    test("400s on an empty id", async () => {
      const { status } = await poll("");
      expect(status).toBe(400);
    });

    test("404s an unknown settlement", async () => {
      const { status, body } = await poll("nope");
      expect(status).toBe(404);
      expect(body.error).toBe("no such settlement");
    });

    test("409s a scripted walkthrough, which has no on-chain state to report", async () => {
      const col = await registerFacility();
      const race = await scriptedRaceIn(col);
      const { status, body } = await poll(race.id);
      expect(status).toBe(409);
      expect(body.error).toContain("scripted walkthrough");
    });

    test("echoes the settlement id", async () => {
      const race = await live();
      const { body } = await poll(race.id);
      expect(body.id).toBe(race.id);
    });
  });

  describe("stage, derived from the chains and not from the stored phase", () => {
    test("WINDOW_OPEN while the deadline is ahead", async () => {
      const race = await live();
      sepolia.raceState = async () => vaultState({ raceOpen: true, raceDeadline: now() + 600 });
      const { body } = await poll(race.id);
      expect(body.stage).toBe("WINDOW_OPEN");
    });

    test("AWAITING_CLOSE once the deadline has passed but nobody has closed it", async () => {
      // The one that surprises people: a deadline passing does not close a race.
      const race = await live();
      sepolia.raceState = async () => vaultState({ raceOpen: true, raceDeadline: now() - 30 });
      const { body } = await poll(race.id);
      expect(body.stage).toBe("AWAITING_CLOSE");
    });

    test("AWAITING_ATTESTATION once closed, while the source block is outside the frontier", async () => {
      const race = await live();
      sepolia.raceState = async () => vaultState({ raceOpen: false });
      attest.isAttested = async () => false;
      const { body } = await poll(race.id);
      expect(body.stage).toBe("AWAITING_ATTESTATION");
    });

    test("PROOF_READY once closed and attested", async () => {
      const race = await live();
      sepolia.raceState = async () => vaultState({ raceOpen: false });
      attest.isAttested = async () => true;
      const { body } = await poll(race.id);
      expect(body.stage).toBe("PROOF_READY");
    });

    test("does not report PROOF_READY just because the store says so", async () => {
      const race = await live({ status: "PRIORITY_SETTLED" });
      sepolia.raceState = async () => vaultState({ raceOpen: true, raceDeadline: now() + 600 });
      const { body } = await poll(race.id);
      expect(body.stage).toBe("WINDOW_OPEN");
    });

    test("an open race is never reported as attested-and-ready", async () => {
      const race = await live();
      sepolia.raceState = async () => vaultState({ raceOpen: true, raceDeadline: now() + 600 });
      attest.isAttested = async () => true;
      const { body } = await poll(race.id);
      expect(body.stage).toBe("WINDOW_OPEN");
    });

    test("PROVEN once a settlement is on the record", async () => {
      const race = await live({ settlement: settlementRecord() });
      const { body } = await poll(race.id);
      expect(body.stage).toBe("PROVEN");
    });

    test("ENCUMBERED once the borrower has drawn", async () => {
      const race = await live({ settlement: settlementRecord() });
      sepolia.raceState = async () => vaultState({ raceOpen: false, totalDrawnUsd: 50_000 });
      const { body } = await poll(race.id);
      expect(body.stage).toBe("ENCUMBERED");
    });

    test("REPAID_AWAITING_PROOF once repayment covers the draw", async () => {
      const race = await live({ settlement: settlementRecord() });
      sepolia.raceState = async () =>
        vaultState({ raceOpen: false, totalDrawnUsd: 50_000, totalRepaidUsd: 50_000 });
      const { body } = await poll(race.id);
      expect(body.stage).toBe("REPAID_AWAITING_PROOF");
    });

    test("stays ENCUMBERED on a partial repayment", async () => {
      const race = await live({ settlement: settlementRecord() });
      sepolia.raceState = async () =>
        vaultState({ raceOpen: false, totalDrawnUsd: 50_000, totalRepaidUsd: 20_000 });
      const { body } = await poll(race.id);
      expect(body.stage).toBe("ENCUMBERED");
    });

    test("stays PROVEN when nothing has been drawn, whatever the repaid figure says", async () => {
      const race = await live({ settlement: settlementRecord() });
      sepolia.raceState = async () =>
        vaultState({ raceOpen: false, totalDrawnUsd: 0, totalRepaidUsd: 999 });
      const { body } = await poll(race.id);
      expect(body.stage).toBe("PROVEN");
    });

    test("settlement ends at PROVEN but the facility does not, so the lane keeps moving", async () => {
      const race = await live({ settlement: settlementRecord() });
      const before = await poll(race.id);
      sepolia.raceState = async () => vaultState({ raceOpen: false, totalDrawnUsd: 1 });
      const after = await poll(race.id);
      expect(before.body.stage).toBe("PROVEN");
      expect(after.body.stage).toBe("ENCUMBERED");
    });
  });

  describe("the vault block", () => {
    test("reports the window's remaining seconds", async () => {
      const race = await live();
      sepolia.raceState = async () => vaultState({ raceOpen: true, raceDeadline: now() + 300 });
      const { body } = await poll(race.id);
      expect(body.vault?.secondsLeft).toBeGreaterThan(290);
      expect(body.vault?.secondsLeft).toBeLessThanOrEqual(300);
    });

    test("never reports negative time remaining", async () => {
      const race = await live();
      sepolia.raceState = async () => vaultState({ raceOpen: true, raceDeadline: now() - 5000 });
      const { body } = await poll(race.id);
      expect(body.vault?.secondsLeft).toBe(0);
    });

    test("says anyone may close it once the deadline has passed", async () => {
      const race = await live();
      sepolia.raceState = async () => vaultState({ raceOpen: true, raceDeadline: now() - 1 });
      const { body } = await poll(race.id);
      expect(body.vault?.closableByAnyone).toBe(true);
    });

    test("says only the obligor may close it while the window is open", async () => {
      const race = await live();
      sepolia.raceState = async () => vaultState({ raceOpen: true, raceDeadline: now() + 600 });
      const { body } = await poll(race.id);
      expect(body.vault?.closableByAnyone).toBe(false);
    });

    test("names the obligor from vault storage", async () => {
      const race = await live();
      sepolia.raceState = async () =>
        vaultState({ obligor: "0x" + "ab".repeat(20) } as never);
      const { body } = await poll(race.id);
      expect(body.vault?.obligor).toBe("0x" + "ab".repeat(20));
    });

    test("reports the vault's own lock count, not the store's", async () => {
      const race = await live();
      sepolia.raceState = async () => vaultState({ lockCount: 3 });
      const { body } = await poll(race.id);
      expect(body.vault?.lockCount).toBe(3);
    });

    test("reports the locked and facility totals", async () => {
      const race = await live();
      sepolia.raceState = async () =>
        vaultState({ totalLockedUsd: 60_000, facilitySizeUsd: 85_000 });
      const { body } = await poll(race.id);
      expect(body.vault?.totalLockedUsd).toBe(60_000);
      expect(body.vault?.facilitySizeUsd).toBe(85_000);
    });

    test("reports the draw window once the race is closed", async () => {
      const race = await live();
      sepolia.raceState = async () => vaultState({ raceOpen: false, drawDeadline: 1_900_000_000 });
      const { body } = await poll(race.id);
      expect(body.vault?.drawDeadline).toBe(1_900_000_000);
    });

    test("a filled facility is still open — filling it does not close it", async () => {
      const race = await live();
      sepolia.raceState = async () =>
        vaultState({
          raceOpen: true,
          raceDeadline: now() + 600,
          totalLockedUsd: 100_000,
          facilitySizeUsd: 100_000,
        });
      const { body } = await poll(race.id);
      expect(body.stage).toBe("WINDOW_OPEN");
      expect(body.vault?.raceOpen).toBe(true);
    });
  });

  describe("the attestation block", () => {
    test("names Attestcoin's chainKey for Sepolia", async () => {
      const race = await live();
      const { body } = await poll(race.id);
      expect(body.attestation?.chainKey).toBe(1);
    });

    test("targets the HIGHEST block any lock landed in", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col, {
        locks: [
          lockRecord({ seq: 1, lockBlockNumber: 9_000_010 }),
          lockRecord({ seq: 2, lockBlockNumber: 9_000_077, sepoliaTxHash: txHash(3) }),
        ],
      });
      const { body } = await poll(race.id);
      expect(body.attestation?.targetHeight).toBe(9_000_077);
    });

    test("falls back to the opening block when no lock has landed", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col, {}, { openBlockNumber: 8_999_999 });
      const { body } = await poll(race.id);
      expect(body.attestation?.targetHeight).toBe(8_999_999);
    });

    test("reports the frontier as the precompile gives it", async () => {
      const race = await live();
      attest.frontier = async () =>
        frontier({ attestedHeight: 8_999_000, checkpointHeight: 8_998_990 });
      const { body } = await poll(race.id);
      expect(body.attestation?.attestedHeight).toBe(8_999_000);
      expect(body.attestation?.checkpointHeight).toBe(8_998_990);
    });

    test("reports the source chain's head", async () => {
      const race = await live();
      sepolia.blockNumber = async () => 9_000_042;
      const { body } = await poll(race.id);
      expect(body.attestation?.sepoliaHead).toBe(9_000_042);
    });

    test("reports the lag, which is the sawtooth everyone asks about", async () => {
      const race = await live();
      sepolia.blockNumber = async () => 9_000_040;
      attest.frontier = async () => frontier({ attestedHeight: 9_000_000 });
      const { body } = await poll(race.id);
      expect(body.attestation?.lagBlocks).toBe(40);
    });

    test("counts the blocks still to go", async () => {
      const race = await live();
      attest.frontier = async () => frontier({ attestedHeight: 9_000_000 });
      const { body } = await poll(race.id);
      // The lock is at 9,000,010.
      expect(body.attestation?.blocksToGo).toBe(10);
    });

    test("never reports negative blocks to go", async () => {
      const race = await live();
      attest.frontier = async () => frontier({ attestedHeight: 9_999_999 });
      const { body } = await poll(race.id);
      expect(body.attestation?.blocksToGo).toBe(0);
    });

    test("reports zero blocks to go the moment the target is inside the frontier", async () => {
      const race = await live();
      attest.frontier = async () => frontier({ attestedHeight: 9_000_010 });
      const { body } = await poll(race.id);
      expect(body.attestation?.blocksToGo).toBe(0);
    });

    test("reports whether the target itself is attested, separately from the frontier", async () => {
      const race = await live();
      attest.isAttested = async () => false;
      const { body } = await poll(race.id);
      expect(body.attestation?.targetAttested).toBe(false);
    });

    test("asks the precompile about the target height", async () => {
      const race = await live();
      let asked = -1;
      attest.isAttested = async (h) => {
        asked = h;
        return true;
      };
      await poll(race.id);
      expect(asked).toBe(9_000_010);
    });
  });

  describe("a settled settlement answers cheaply", () => {
    test("makes no attestation reads at all", async () => {
      const race = await live({ settlement: settlementRecord() });
      let reads = 0;
      attest.frontier = async () => {
        reads++;
        return frontier();
      };
      attest.isAttested = async () => {
        reads++;
        return true;
      };
      await poll(race.id);
      expect(reads).toBe(0);
    });

    test("makes exactly one vault read", async () => {
      const race = await live({ settlement: settlementRecord() });
      let reads = 0;
      sepolia.raceState = async () => {
        reads++;
        return vaultState({ raceOpen: false });
      };
      await poll(race.id);
      expect(reads).toBe(1);
    });

    test("does not read the source chain's head", async () => {
      const race = await live({ settlement: settlementRecord() });
      let reads = 0;
      sepolia.blockNumber = async () => {
        reads++;
        return 1;
      };
      await poll(race.id);
      expect(reads).toBe(0);
    });

    test("reports the target as attested, which is fixed and true", async () => {
      const race = await live({ settlement: settlementRecord() });
      const { body } = await poll(race.id);
      expect(body.attestation?.targetAttested).toBe(true);
      expect(body.attestation?.blocksToGo).toBe(0);
      expect(body.attestation?.lagBlocks).toBe(0);
    });

    test("reports the settled race as closed and not closable", async () => {
      const race = await live({ settlement: settlementRecord() });
      const { body } = await poll(race.id);
      expect(body.vault?.raceOpen).toBe(false);
      expect(body.vault?.closableByAnyone).toBe(false);
      expect(body.vault?.secondsLeft).toBe(0);
    });

    test("prefers the vault's locked total when it can read it", async () => {
      const race = await live({ settlement: settlementRecord() });
      sepolia.raceState = async () => vaultState({ raceOpen: false, totalLockedUsd: 61_000 });
      const { body } = await poll(race.id);
      expect(body.vault?.totalLockedUsd).toBe(61_000);
    });

    test("falls back to the stored locks when the vault read fails", async () => {
      const race = await live({ settlement: settlementRecord() });
      sepolia.raceState = async () => {
        throw new Error("rpc hiccup");
      };
      const { status: code, body } = await poll(race.id);
      expect(code).toBe(200);
      expect(body.vault?.totalLockedUsd).toBe(60_000);
    });

    test("excludes refunded capital from that fallback total", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col, {
        settlement: settlementRecord(),
        locks: [
          lockRecord({ seq: 1, amountUsd: 60_000 }),
          lockRecord({ seq: 2, amountUsd: 40_000, refunded: true, sepoliaTxHash: txHash(3) }),
        ],
      });
      sepolia.raceState = async () => {
        throw new Error("rpc hiccup");
      };
      const { body } = await poll(race.id);
      expect(body.vault?.totalLockedUsd).toBe(60_000);
    });

    test("reports the lock count from the record it already has", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col, {
        settlement: settlementRecord(),
        locks: [lockRecord({ seq: 1 }), lockRecord({ seq: 2, sepoliaTxHash: txHash(3) })],
      });
      const { body } = await poll(race.id);
      expect(body.vault?.lockCount).toBe(2);
    });

    test("still answers 200 when the servicing read fails entirely", async () => {
      const race = await live({ settlement: settlementRecord() });
      sepolia.raceState = async () => {
        throw new Error("down");
      };
      const { status: code, body } = await poll(race.id);
      expect(code).toBe(200);
      expect(body.stage).toBe("PROVEN");
    });
  });

  describe("chains that cannot be reached", () => {
    test("502s when no vault is deployed to read", async () => {
      const race = await live();
      sepolia.why = "contracts/deployments/sepolia.json is missing";
      const { status, body } = await poll(race.id);
      expect(status).toBe(502);
      expect(body.error).toContain("sepolia.json is missing");
    });

    test("502s when the vault read fails", async () => {
      const race = await live();
      sepolia.raceState = async () => {
        throw new Error("sepolia rpc down");
      };
      const { status, body } = await poll(race.id);
      expect(status).toBe(502);
      expect(body.error).toContain("sepolia rpc down");
    });

    test("502s when the precompile read fails", async () => {
      const race = await live();
      attest.frontier = async () => {
        throw new Error("cc3 rpc down");
      };
      const { status } = await poll(race.id);
      expect(status).toBe(502);
    });

    test("502s when the source head cannot be read", async () => {
      const race = await live();
      sepolia.blockNumber = async () => {
        throw new Error("no head");
      };
      const { status } = await poll(race.id);
      expect(status).toBe(502);
    });

    test("says the chain is unreachable rather than showing a stale panel", async () => {
      const race = await live();
      sepolia.raceState = async () => {
        throw new Error("timeout");
      };
      const { body } = await poll(race.id);
      expect(body.ok).toBe(false);
      expect(body.stage).toBeUndefined();
    });
  });

  describe("the prover", () => {
    test("reports the prover as available", async () => {
      const race = await live();
      const { body } = await poll(race.id);
      expect(body.prover?.available).toBe(true);
    });

    test("reports why it is not, so the UI can offer the command instead of a broken button", async () => {
      const race = await live();
      prover.available = { ok: false, why: "no worker checkout on this host" };
      const { body } = await poll(race.id);
      expect(body.prover?.available).toBe(false);
      expect(body.prover?.unavailableReason).toBe("no worker checkout on this host");
    });

    test("omits the reason when the prover is available", async () => {
      const race = await live();
      const { body } = await poll(race.id);
      expect(body.prover?.unavailableReason).toBeUndefined();
    });

    test("reports a running job's stage", async () => {
      const race = await live();
      prover.job = proverJob({ raceId: race.id, stage: "fetching the batch proof" });
      const { body } = await poll(race.id);
      expect(body.prover?.job?.stage).toBe("fetching the batch proof");
    });

    test("omits the job when none is running", async () => {
      const race = await live();
      const { body } = await poll(race.id);
      expect(body.prover?.job).toBeUndefined();
    });

    test("returns only the tail of the log — the whole thing is for a terminal", async () => {
      const race = await live();
      prover.job = proverJob({
        raceId: race.id,
        log: Array.from({ length: 40 }, (_, i) => `line ${i}`),
      });
      const { body } = await poll(race.id);
      expect(body.prover?.job?.log).toHaveLength(8);
      expect(body.prover?.job?.log?.at(-1)).toBe("line 39");
    });

    test("names the exact command, not 'run the worker'", async () => {
      const race = await live();
      const { body } = await poll(race.id);
      expect(body.proverCommand).toContain("bun run src/cli.ts prove");
      expect(body.proverCommand).toContain(race.onchain!.collateralId);
      expect(body.proverCommand).toContain("--from-vault");
    });
  });

  describe("recording a proof the prover finished between polls", () => {
    test("applies the settlement on the request the page was already making", async () => {
      const race = await live();
      prover.job = proverJob({
        raceId: race.id,
        state: "done",
        evidencePath: "evidence/proof.json",
      } as never);
      liveRace.applyProvenSettlement = async () => {
        const repos = await import("@/lib/precedence/store/repositories");
        const stored = (await repos.getRace(race.id))!;
        return repos.saveRace({ ...stored, settlement: settlementRecord() });
      };
      const { body } = await poll(race.id);
      expect(body.stage).toBe("PROVEN");
    });

    test("passes the race id and the evidence path", async () => {
      const race = await live();
      prover.job = proverJob({
        raceId: race.id,
        state: "done",
        evidencePath: "evidence/proof.json",
      } as never);
      liveRace.applyProvenSettlement = async () => undefined;
      await poll(race.id);
      expect(liveRace.appliedWith).toEqual([
        { raceId: race.id, evidencePath: "evidence/proof.json" },
      ]);
    });

    test("does not apply it twice", async () => {
      const race = await live({ settlement: settlementRecord() });
      prover.job = proverJob({
        raceId: race.id,
        state: "done",
        evidencePath: "evidence/proof.json",
      } as never);
      await poll(race.id);
      expect(liveRace.appliedWith).toEqual([]);
    });

    test("does not apply it while the prover is still running", async () => {
      const race = await live();
      prover.job = proverJob({ raceId: race.id, state: "running" });
      await poll(race.id);
      expect(liveRace.appliedWith).toEqual([]);
    });

    test("does not apply it when the job failed", async () => {
      const race = await live();
      prover.job = proverJob({ raceId: race.id, state: "failed" } as never);
      await poll(race.id);
      expect(liveRace.appliedWith).toEqual([]);
    });

    test("does not apply it when there is no evidence path", async () => {
      const race = await live();
      prover.job = proverJob({ raceId: race.id, state: "done" } as never);
      await poll(race.id);
      expect(liveRace.appliedWith).toEqual([]);
    });

    test("keeps answering the poll when recording fails", async () => {
      const race = await live();
      prover.job = proverJob({
        raceId: race.id,
        state: "done",
        evidencePath: "evidence/proof.json",
      } as never);
      liveRace.applyProvenSettlement = async () => {
        throw new Error("no evidence at that path");
      };
      const { status: code } = await poll(race.id);
      expect(code).toBe(200);
    });

    test("says the proof is on Creditcoin regardless and only the record failed", async () => {
      const race = await live();
      prover.job = proverJob({
        raceId: race.id,
        state: "done",
        evidencePath: "evidence/proof.json",
      } as never);
      liveRace.applyProvenSettlement = async () => {
        throw new Error("no evidence at that path");
      };
      const { body } = await poll(race.id);
      expect(body.prover?.job?.error).toContain("settled on chain");
      expect(body.prover?.job?.error).toContain("could not record it");
    });

    test("does not blank the panel over a bookkeeping problem", async () => {
      const race = await live();
      sepolia.raceState = async () => vaultState({ raceOpen: false });
      attest.isAttested = async () => true;
      prover.job = proverJob({
        raceId: race.id,
        state: "done",
        evidencePath: "evidence/proof.json",
      } as never);
      liveRace.applyProvenSettlement = async () => {
        throw new Error("bad evidence");
      };
      const { body } = await poll(race.id);
      expect(body.stage).toBe("PROOF_READY");
      expect(body.vault).toBeDefined();
    });
  });
});
