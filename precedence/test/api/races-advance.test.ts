/**
 * `POST /api/races/:id/advance` — stepping the scripted walkthrough.
 *
 * @remarks The important test in this file is the 409. `runRace` and `stepRace` execute the
 * lifecycle against the *simulated* adapters, which is what makes a walkthrough finish in
 * seconds; pointing them at a race that exists on Sepolia would overwrite genuine locks with
 * fabricated ones and write a settlement no proof supports. The app would then show a settled
 * facility whose settlement never happened.
 *
 * It is enforced in the route rather than only in the UI because a hidden button is a courtesy
 * and this is an invariant.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { resetFakes } from "../helpers/fakes";
import { freshStore, liveRaceIn, registerFacility, scriptedRaceIn } from "../helpers/fixtures";
import { ctx, json, post, postRaw } from "../helpers/http";

const route = () => import("@/app/api/races/[id]/advance/route");

async function advance(id: string, body?: unknown) {
  const { POST } = await route();
  return json<{ ok: boolean; error?: string; phase?: string; running?: boolean; race?: { status: string } }>(
    await POST(post(`/api/races/${id}/advance`, body), ctx({ id })),
  );
}

/** A scripted race parked at a chosen phase. */
async function scripted(status = "COLLATERAL_REGISTERED", id = "scripted-1") {
  const col = await registerFacility({ id: `col-${id}` });
  return scriptedRaceIn(col, { id, status: status as never });
}

describe("POST /api/races/:id/advance", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  describe("the race has to exist", () => {
    test("404s an unknown race", async () => {
      const { status, body } = await advance("no-such-race", { mode: "step" });
      expect(status).toBe(404);
      expect(body.error).toBe("not found");
    });

    test("404s before doing any work", async () => {
      const { body } = await advance("no-such-race", { mode: "step" });
      expect(body.phase).toBeUndefined();
    });

    test("404s an empty id", async () => {
      const { status } = await advance("", { mode: "step" });
      expect(status).toBe(404);
    });
  });

  describe("a live settlement is refused", () => {
    test("409s rather than advancing it", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col);
      const { status } = await advance(race.id, { mode: "step" });
      expect(status).toBe(409);
    });

    test("409s in auto mode too", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col);
      const { status } = await advance(race.id, {});
      expect(status).toBe(409);
    });

    test("explains that the settlement exists on chain", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col);
      const { body } = await advance(race.id, { mode: "step" });
      expect(body.error).toContain("exists on chain");
    });

    test("points at attestation as what actually progresses it", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col);
      const { body } = await advance(race.id, { mode: "step" });
      expect(body.error).toContain("Attestcoin");
    });

    test("points at the worker", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col);
      const { body } = await advance(race.id, { mode: "step" });
      expect(body.error).toContain("worker/README.md");
    });

    test("leaves the race untouched", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col);
      await advance(race.id, { mode: "step" });
      const repos = await import("@/lib/precedence/store/repositories");
      const after = await repos.getRace(race.id);
      expect(after?.status).toBe("RACE_OPEN");
      expect(after?.locks).toEqual([]);
    });

    test("keys off `simulated === false`, not off the presence of a settlement", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col, { settlement: undefined });
      const { status } = await advance(race.id, { mode: "step" });
      expect(status).toBe(409);
    });

    test("allows a race whose `simulated` flag is absent, which is the legacy shape", async () => {
      const col = await registerFacility({ id: "col-legacy" });
      const race = await scriptedRaceIn(col, { id: "legacy-1" });
      const repos = await import("@/lib/precedence/store/repositories");
      await repos.saveRace({ ...race, simulated: undefined as never });
      const { status } = await advance("legacy-1", { mode: "step" });
      expect(status).toBe(200);
    });
  });

  describe("stepping", () => {
    test("answers 200", async () => {
      const race = await scripted();
      const { status } = await advance(race.id, { mode: "step" });
      expect(status).toBe(200);
    });

    test("returns the phase it reached", async () => {
      const race = await scripted();
      const { body } = await advance(race.id, { mode: "step" });
      expect(body.phase).toBe("RACE_OPEN");
    });

    test("returns the race as it now stands", async () => {
      const race = await scripted();
      const { body } = await advance(race.id, { mode: "step" });
      expect(body.race?.status).toBe("RACE_OPEN");
    });

    test("persists the new phase", async () => {
      const race = await scripted();
      await advance(race.id, { mode: "step" });
      const repos = await import("@/lib/precedence/store/repositories");
      expect((await repos.getRace(race.id))?.status).toBe("RACE_OPEN");
    });

    test("walks the performing sequence one phase at a time", async () => {
      const race = await scripted();
      const seen: string[] = [];
      for (let i = 0; i < 4; i++) {
        const { body } = await advance(race.id, { mode: "step" });
        seen.push(body.phase!);
      }
      expect(seen.slice(0, 2)).toEqual(["RACE_OPEN", "PRIORITY_SETTLED"]);
    });

    test("reaches a terminal state and stops there", async () => {
      const race = await scripted();
      const { isTerminal } = await import("@/lib/precedence/orchestrator/lifecycle");
      let phase = "";
      for (let i = 0; i < 32; i++) {
        const { body } = await advance(race.id, { mode: "step" });
        phase = body.phase!;
        if (isTerminal(phase as never)) break;
      }
      expect(isTerminal(phase as never)).toBe(true);
    });

    test("stepping an already-aborted race returns ABORTED rather than throwing", async () => {
      const race = await scripted("ABORTED", "aborted-1");
      const { status, body } = await advance(race.id, { mode: "step" });
      expect(status).toBe(200);
      expect(body.phase).toBe("ABORTED");
    });
  });

  describe("auto mode", () => {
    test("returns immediately and says it is running", async () => {
      const race = await scripted();
      const { status, body } = await advance(race.id, {});
      expect(status).toBe(200);
      expect(body.running).toBe(true);
    });

    test("does not return the race, because it is still changing", async () => {
      const race = await scripted();
      const { body } = await advance(race.id, {});
      expect(body.race).toBeUndefined();
    });

    test("is the default when no mode is given", async () => {
      const race = await scripted();
      const { body } = await advance(race.id, { mode: undefined });
      expect(body.running).toBe(true);
    });

    test("is the default for an unrecognised mode", async () => {
      const race = await scripted();
      const { body } = await advance(race.id, { mode: "sideways" });
      expect(body.running).toBe(true);
    });

    test("tolerates a body that is not JSON", async () => {
      const race = await scripted();
      const { POST } = await route();
      const res = await POST(
        postRaw(`/api/races/${race.id}/advance`, "not json"),
        ctx({ id: race.id }),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).running).toBe(true);
    });

    test("tolerates no body at all", async () => {
      const race = await scripted();
      const { POST } = await route();
      const res = await POST(
        new Request(`http://t/api/races/${race.id}/advance`, { method: "POST" }),
        ctx({ id: race.id }),
      );
      expect(res.status).toBe(200);
    });

    test(
      "actually advances the race in the background",
      async () => {
        const race = await scripted();
        await advance(race.id, {});
        const repos = await import("@/lib/precedence/store/repositories");
        const { isTerminal } = await import("@/lib/precedence/orchestrator/lifecycle");
        for (let i = 0; i < 300; i++) {
          const r = await repos.getRace(race.id);
          if (r && isTerminal(r.status)) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        const after = await repos.getRace(race.id);
        expect(after?.status).not.toBe("COLLATERAL_REGISTERED");
      },
      45_000,
    );
  });
});
