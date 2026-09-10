/**
 * `POST /api/races/live/prove` — submitting the proof for a settlement that is ready for one.
 *
 * @remarks Every refusal in this route is a refusal that happens *before* any gas is spent, and
 * that is the reason each has its own test. Readiness is re-checked here against the precompile
 * rather than trusted from the caller: the button is only offered when the panel says
 * PROOF_READY, but the panel's opinion is a rendering of a poll that may be twenty seconds old,
 * and starting a prover against an unattested block wastes real gas failing.
 *
 * The two preconditions that are easy to miss are both covered. A proof can be perfectly valid
 * and still revert because the engine settles against the *Creditcoin* registry, which is a
 * separate registration on a separate chain. And the chain may have settled the race already,
 * which `race.settlement` cannot tell you — that is only this app's record, and a store reset
 * does not have it.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { ProverBusyError } from "../setup";
import { attest, prover, proverJob, resetFakes, txHash } from "../helpers/fakes";
import {
  freshStore,
  liveRaceIn,
  lockRecord,
  registerFacility,
  scriptedRaceIn,
  settlementRecord,
} from "../helpers/fixtures";
import { json, post, postRaw } from "../helpers/http";

const route = () => import("@/app/api/races/live/prove/route");

interface Body {
  ok: boolean;
  error?: string;
  job?: { state: string; stage: string };
}

async function prove(body: unknown) {
  const { POST } = await route();
  return json<Body>(await POST(post("/api/races/live/prove", body)));
}

/** A live race with one lock, attested and ready. */
async function ready(over = {}) {
  const col = await registerFacility();
  return liveRaceIn(col, { locks: [lockRecord()], ...over });
}

describe("POST /api/races/live/prove", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  describe("the request", () => {
    test("400s with no id", async () => {
      const { status, body } = await prove({});
      expect(status).toBe(400);
      expect(body.error).toBe("id is required");
    });

    test("400s on a body that is not JSON", async () => {
      const { POST } = await route();
      const res = await POST(postRaw("/api/races/live/prove", "!"));
      expect(res.status).toBe(400);
    });

    test("400s on no body", async () => {
      const { POST } = await route();
      const res = await POST(new Request("http://t/api/races/live/prove", { method: "POST" }));
      expect(res.status).toBe(400);
    });

    test("404s an unknown settlement", async () => {
      const { status, body } = await prove({ id: "not-a-race" });
      expect(status).toBe(404);
      expect(body.error).toBe("no such settlement");
    });
  });

  describe("refusals that cost no gas", () => {
    test("409s a scripted walkthrough, which has nothing to prove", async () => {
      const col = await registerFacility();
      const race = await scriptedRaceIn(col);
      const { status, body } = await prove({ id: race.id });
      expect(status).toBe(409);
      expect(body.error).toContain("nothing to prove");
    });

    test("409s a settlement that is already proven", async () => {
      const race = await ready({ settlement: settlementRecord() });
      const { status, body } = await prove({ id: race.id });
      expect(status).toBe(409);
      expect(body.error).toBe("this settlement is already proven");
    });

    test("409s a race with no locks", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col);
      const { status, body } = await prove({ id: race.id });
      expect(status).toBe(409);
      expect(body.error).toBe("there are no locks to prove");
    });

    test("501s where no worker is available to run the prover", async () => {
      const race = await ready();
      prover.available = { ok: false, why: "no worker checkout on this host" };
      const { status, body } = await prove({ id: race.id });
      expect(status).toBe(501);
      expect(body.error).toBe("no worker checkout on this host");
    });

    test("501 rather than 500, because an absent worker is a configuration not a fault", async () => {
      const race = await ready();
      prover.available = { ok: false, why: "nope" };
      const { status } = await prove({ id: race.id });
      expect(status).toBe(501);
    });

    test("409s a block that is not attested yet", async () => {
      const race = await ready();
      attest.isAttested = async () => false;
      const { status, body } = await prove({ id: race.id });
      expect(status).toBe(409);
      expect(body.error).toContain("is not attested yet");
    });

    test("names the block that is waiting", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col, {
        locks: [lockRecord({ lockBlockNumber: 9_123_456 })],
      });
      attest.isAttested = async () => false;
      const { body } = await prove({ id: race.id });
      expect(body.error).toContain("9,123,456");
    });

    test("checks the HIGHEST block any lock landed in", async () => {
      // A race legitimately spans blocks; using the first lock's block would report ready while
      // the deciding lock was not.
      const col = await registerFacility();
      const race = await liveRaceIn(col, {
        locks: [
          lockRecord({ seq: 1, lockBlockNumber: 9_000_010 }),
          lockRecord({ seq: 2, lockBlockNumber: 9_000_099, sepoliaTxHash: txHash(3) }),
        ],
      });
      let asked = -1;
      attest.isAttested = async (h) => {
        asked = h;
        return true;
      };
      await prove({ id: race.id });
      expect(asked).toBe(9_000_099);
    });

    test("502s when the precompile could not be read", async () => {
      const race = await ready();
      attest.isAttested = async () => {
        throw new Error("cc3 rpc unreachable");
      };
      const { status, body } = await prove({ id: race.id });
      expect(status).toBe(502);
      expect(body.error).toContain("cc3 rpc unreachable");
    });

    test("409s when Creditcoin is not ready for the settlement", async () => {
      const race = await ready();
      attest.readiness = async () => ({
        ok: false,
        why: "this collateral is not registered on Creditcoin",
      });
      const { status, body } = await prove({ id: race.id });
      expect(status).toBe(409);
      expect(body.error).toContain("not registered on Creditcoin");
    });

    test("checks Creditcoin readiness after attestation, not instead of it", async () => {
      const race = await ready();
      let readinessAsked = false;
      attest.isAttested = async () => false;
      attest.readiness = async () => {
        readinessAsked = true;
        return { ok: true };
      };
      await prove({ id: race.id });
      expect(readinessAsked).toBe(false);
    });

    test("409s when Creditcoin has already settled the race", async () => {
      const race = await ready();
      attest.alreadySettled = async () => true;
      const { status, body } = await prove({ id: race.id });
      expect(status).toBe(409);
      expect(body.error).toContain("already settled this race");
    });

    test("says the on-chain proof stands even without a local record", async () => {
      const race = await ready();
      attest.alreadySettled = async () => true;
      const { body } = await prove({ id: race.id });
      expect(body.error).toContain("store reset");
      expect(body.error).toContain("the proof on chain stands");
    });

    test("asks the chain about the document hash, not the facility slug", async () => {
      const race = await ready();
      let asked = "";
      attest.alreadySettled = async (id) => {
        asked = id;
        return false;
      };
      await prove({ id: race.id });
      expect(asked).toBe(race.onchain!.collateralId);
    });

    test("starts no prover when it refuses", async () => {
      const race = await ready();
      attest.isAttested = async () => false;
      await prove({ id: race.id });
      expect(prover.started).toEqual([]);
    });
  });

  describe("starting the prover", () => {
    test("answers 202 and does not wait", async () => {
      const race = await ready();
      const { status } = await prove({ id: race.id });
      expect(status).toBe(202);
    });

    test("reports the job's initial state", async () => {
      const race = await ready();
      const { body } = await prove({ id: race.id });
      expect(body.ok).toBe(true);
      expect(body.job?.state).toBe("running");
    });

    test("passes the race id and the document hash to the prover", async () => {
      const race = await ready();
      await prove({ id: race.id });
      expect(prover.started).toEqual([
        { raceId: race.id, collateralId: race.onchain!.collateralId },
      ]);
    });

    test("starts exactly one prover", async () => {
      const race = await ready();
      await prove({ id: race.id });
      expect(prover.started).toHaveLength(1);
    });

    test("409s a second attempt while one is running", async () => {
      const race = await ready();
      prover.startThrows = new ProverBusyError("a prover is already running for this settlement");
      prover.job = proverJob({ raceId: race.id, stage: "waiting for attestation" });
      const { status, body } = await prove({ id: race.id });
      expect(status).toBe(409);
      expect(body.error).toContain("already running");
    });

    test("reports the running job's progress on that refusal", async () => {
      const race = await ready();
      prover.startThrows = new ProverBusyError("busy");
      prover.job = proverJob({ raceId: race.id, stage: "submitting to 0x0FD2" });
      const { body } = await prove({ id: race.id });
      expect(body.job).toEqual({ state: "running", stage: "submitting to 0x0FD2" });
    });

    test("omits the job when there is none to report", async () => {
      const race = await ready();
      prover.startThrows = new ProverBusyError("busy");
      prover.job = undefined;
      const { body } = await prove({ id: race.id });
      expect(body.job).toBeUndefined();
    });

    test("500s an unexpected failure to start", async () => {
      const race = await ready();
      prover.startThrows = new Error("spawn ENOENT");
      const { status, body } = await prove({ id: race.id });
      expect(status).toBe(500);
      expect(body.error).toContain("spawn ENOENT");
    });

    test("keeps a busy prover on 409 and a broken one on 500", async () => {
      const race = await ready();
      prover.startThrows = new ProverBusyError("busy");
      const busy = await prove({ id: race.id });
      prover.startThrows = new Error("broken");
      const broken = await prove({ id: race.id });
      expect(busy.status).toBe(409);
      expect(broken.status).toBe(500);
    });

    test("writes no settlement — that is the worker's result, not this route's", async () => {
      const race = await ready();
      await prove({ id: race.id });
      const repos = await import("@/lib/precedence/store/repositories");
      expect((await repos.getRace(race.id))?.settlement).toBeUndefined();
    });

    test("leaves the race's status alone", async () => {
      const race = await ready();
      await prove({ id: race.id });
      const repos = await import("@/lib/precedence/store/repositories");
      expect((await repos.getRace(race.id))?.status).toBe("RACE_OPEN");
    });
  });
});
