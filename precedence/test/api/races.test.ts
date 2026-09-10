/**
 * `GET|POST /api/races` and `GET /api/races/:id`.
 *
 * @remarks A race created here is always a *walkthrough*: it runs the whole lifecycle against the
 * simulated adapters in seconds and every hash it produces is fabricated. `simulated: true` is
 * therefore not a detail but the thing that lets the UI refuse to render those hashes as explorer
 * links, so it is asserted on every path.
 *
 * `scenario` exists so the demo can trigger the failure act on command instead of waiting for a
 * real default. An unrecognised value has to fall back to the happy path rather than throw — a
 * bad query string must not break a demo that is being recorded.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { resetFakes } from "../helpers/fakes";
import { freshStore, liveRaceIn, registerFacility } from "../helpers/fixtures";
import { ctx, get, json, post, postRaw } from "../helpers/http";

const collection = () => import("@/app/api/races/route");
const detail = () => import("@/app/api/races/[id]/route");

interface Summary {
  id: string;
  status: string;
  track: string;
  collateralSymbol: string;
  obligor: string;
  bidCount: number;
  totalCapitalUsd: number;
  outcome: string;
  seniorFinancier?: string;
}

/** `mode: "step"` so nothing walks the lifecycle in the background during a test. */
async function create(body: Record<string, unknown> = {}) {
  const { POST } = await collection();
  return json<{ ok: boolean; id: string; race: Record<string, unknown> }>(
    await POST(post("/api/races", { mode: "step", ...body })),
  );
}

describe("GET /api/races", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("answers 200", async () => {
    const { GET } = await collection();
    expect((await GET()).status).toBe(200);
  });

  test("returns the seeded history", async () => {
    const { GET } = await collection();
    const { body } = await json<{ ok: boolean; races: Summary[] }>(await GET());
    expect(body.races.map((r) => r.id)).toEqual(["seed-race-8802"]);
  });

  test("summarises rather than returning the whole race", async () => {
    const { GET } = await collection();
    const { body } = await json<{ races: Record<string, unknown>[] }>(await GET());
    // A summary deliberately drops `onchain`, `locks` and `proofRecord`.
    expect(body.races[0].locks).toBeUndefined();
    expect(body.races[0].onchain).toBeUndefined();
  });

  test("carries the collateral symbol, which is how a facility page finds its race", async () => {
    const { GET } = await collection();
    const { body } = await json<{ races: Summary[] }>(await GET());
    expect(body.races[0].collateralSymbol).toBe("COFFEE-8802");
  });

  test("names the senior financier on a settled race", async () => {
    const { GET } = await collection();
    const { body } = await json<{ races: Summary[] }>(await GET());
    expect(body.races[0].seniorFinancier).toBe("meridian");
  });

  test("counts the bids", async () => {
    const { GET } = await collection();
    const { body } = await json<{ races: Summary[] }>(await GET());
    expect(body.races[0].bidCount).toBe(3);
  });

  test("totals the committed capital rather than the requested amount", async () => {
    const { GET } = await collection();
    const { body } = await json<{ races: Summary[] }>(await GET());
    // 5100 + 2550 + 5100, including the bid that was refunded.
    expect(body.races[0].totalCapitalUsd).toBe(12_750);
  });

  test("falls back to the requested total when there are no bids", async () => {
    const col = await registerFacility({ id: "col-nobids" });
    await liveRaceIn(col, { id: "race-nobids", requestedTotalUsd: 42_000 });
    const { GET } = await collection();
    const { body } = await json<{ races: Summary[] }>(await GET());
    expect(body.races.find((r) => r.id === "race-nobids")?.totalCapitalUsd).toBe(42_000);
  });

  describe("outcome, derived from status", () => {
    const cases = [
      ["SETTLED_CLOSED", "won"],
      ["AUTO_REFUND", "lost"],
      ["ABORTED", "rejected"],
      ["TERMINATED_DEFAULT", "defaulted"],
      ["RACE_OPEN", "in-progress"],
      ["ENCUMBERED", "in-progress"],
    ] as const;

    for (const [status, outcome] of cases) {
      test(`${status} reads as ${outcome}`, async () => {
        const col = await registerFacility({ id: `col-${status}` });
        await liveRaceIn(col, { id: `race-${status}`, status: status as never });
        const { GET } = await collection();
        const { body } = await json<{ races: Summary[] }>(await GET());
        expect(body.races.find((r) => r.id === `race-${status}`)?.outcome).toBe(outcome);
      });
    }
  });
});

describe("POST /api/races", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("answers 202, because the walkthrough is not finished when it returns", async () => {
    const { status } = await create();
    expect(status).toBe(202);
  });

  test("returns the new race and its id", async () => {
    const { body } = await create();
    expect(body.ok).toBe(true);
    expect(body.id).toBe((body.race as { id: string }).id);
  });

  test("marks the race simulated, which is what stops a fabricated hash becoming a link", async () => {
    const { body } = await create();
    expect(body.race.simulated).toBe(true);
  });

  test("starts at COLLATERAL_REGISTERED", async () => {
    const { body } = await create();
    expect(body.race.status).toBe("COLLATERAL_REGISTERED");
  });

  test("starts on the performing track", async () => {
    const { body } = await create();
    expect(body.race.track).toBe("PERFORMING");
  });

  test("has no onchain block at all", async () => {
    const { body } = await create();
    expect(body.race.onchain).toBeUndefined();
  });

  test("opens against a named collateral", async () => {
    const { body } = await create({ collateralId: "col-8804" });
    expect((body.race.collateral as { id: string }).id).toBe("col-8804");
  });

  test("finds the collateral by symbol too", async () => {
    const { body } = await create({ collateralId: "FREIGHT-8804" });
    expect((body.race.collateral as { id: string }).id).toBe("col-8804");
  });

  test("falls back to the first facility for an unknown collateral", async () => {
    const { status, body } = await create({ collateralId: "col-does-not-exist" });
    expect(status).toBe(202);
    expect((body.race.collateral as { id: string }).id).toBe("col-8802");
  });

  test("honours a requested total", async () => {
    const { body } = await create({ collateralId: "col-8805", requestedTotalUsd: 30_000 });
    expect(body.race.requestedTotalUsd).toBe(30_000);
  });

  test("defaults the total to the facility's own request", async () => {
    const { body } = await create({ collateralId: "col-8805" });
    expect(body.race.requestedTotalUsd).toBe(42_500);
  });

  test("attaches an analysis sized to the requested total", async () => {
    const { body } = await create({ collateralId: "col-8805", requestedTotalUsd: 10_000 });
    const analysis = body.race.analysis as { suggestedTranches: { seniorUsd: number } };
    expect(analysis.suggestedTranches.seniorUsd).toBe(6000);
  });

  describe("scenario", () => {
    for (const s of ["performing", "default", "breach"]) {
      test(`accepts ${s}`, async () => {
        const { body } = await create({ scenario: s });
        expect(body.race.scenario).toBe(s);
      });
    }

    test("falls back to performing for an unknown scenario, rather than throwing", async () => {
      const { status, body } = await create({ scenario: "apocalypse" });
      expect(status).toBe(202);
      expect(body.race.scenario).toBe("performing");
    });

    test("falls back to performing when none is given", async () => {
      const { body } = await create();
      expect(body.race.scenario).toBe("performing");
    });

    test("ignores a non-string scenario", async () => {
      const { body } = await create({ scenario: 7 });
      expect(body.race.scenario).toBe("performing");
    });
  });

  describe("the body", () => {
    test("tolerates a body that is not JSON", async () => {
      const { POST } = await collection();
      const res = await POST(postRaw("/api/races", "]["));
      expect(res.status).toBe(202);
    });

    test("tolerates no body at all", async () => {
      const { POST } = await collection();
      const res = await POST(new Request("http://t/api/races", { method: "POST" }));
      expect(res.status).toBe(202);
    });

    test("400s nothing — a bad request still opens the default walkthrough", async () => {
      const { POST } = await collection();
      const res = await POST(post("/api/races", { collateralId: 42, scenario: null }));
      expect(res.status).toBe(202);
    });
  });

  test("stores the race so it is immediately readable", async () => {
    const { body } = await create();
    const { GET } = await detail();
    const read = await json<{ ok: boolean }>(
      await GET(get(`/api/races/${body.id}`), ctx({ id: body.id })),
    );
    expect(read.status).toBe(200);
  });

  test("appears in the collection listing", async () => {
    const { body } = await create();
    const { GET } = await collection();
    const list = await json<{ races: Summary[] }>(await GET());
    expect(list.body.races.some((r) => r.id === body.id)).toBe(true);
  });

  test("errors when there is no collateral to race against", async () => {
    const { getDb } = await import("@/lib/precedence/store/json-store");
    getDb().collateral.length = 0;
    const { POST } = await collection();
    expect(POST(post("/api/races", { mode: "step" }))).rejects.toThrow(
      "No collateral assets available",
    );
  });

  test(
    "runs the walkthrough to a terminal state in auto mode",
    async () => {
      // The one test that lets a real background run happen, and it waits for the run to finish
      // rather than only for the response: the engine dwells 600ms between stages for SSE pacing,
      // so a run left in flight would still be writing to the store during the next test.
      const { POST } = await collection();
      const { body } = await json<{ id: string }>(await POST(post("/api/races", {})));
      const repos = await import("@/lib/precedence/store/repositories");
      const { isTerminal } = await import("@/lib/precedence/orchestrator/lifecycle");
      for (let i = 0; i < 300; i++) {
        const race = await repos.getRace(body.id);
        if (race && isTerminal(race.status)) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const race = await repos.getRace(body.id);
      expect(isTerminal(race!.status)).toBe(true);
    },
    45_000,
  );
});

describe("GET /api/races/:id", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("returns the full race, not a summary", async () => {
    const { GET } = await detail();
    const { status, body } = await json<{ ok: boolean; race: { locks: unknown[] } }>(
      await GET(get("/api/races/seed-race-8802"), ctx({ id: "seed-race-8802" })),
    );
    expect(status).toBe(200);
    expect(body.race.locks).toHaveLength(3);
  });

  test("404s an unknown race", async () => {
    const { GET } = await detail();
    const { status, body } = await json<{ ok: boolean; error: string }>(
      await GET(get("/api/races/nope"), ctx({ id: "nope" })),
    );
    expect(status).toBe(404);
    expect(body.error).toBe("not found");
  });

  test("carries the settlement", async () => {
    const { GET } = await detail();
    const { body } = await json<{ race: { settlement: { seniorFinancier: string } } }>(
      await GET(get("/api/races/seed-race-8802"), ctx({ id: "seed-race-8802" })),
    );
    expect(body.race.settlement.seniorFinancier).toBe("meridian");
  });

  test("carries the proof record with the precompile it used", async () => {
    const { GET } = await detail();
    const { body } = await json<{ race: { proofRecord: { precompile: string } } }>(
      await GET(get("/api/races/seed-race-8802"), ctx({ id: "seed-race-8802" })),
    );
    expect(body.race.proofRecord.precompile.toUpperCase()).toEndWith("FD2");
  });

  test("the seeded locks all share one block, which is the case the protocol exists for", async () => {
    const { GET } = await detail();
    const { body } = await json<{ race: { locks: { lockBlockNumber: number }[] } }>(
      await GET(get("/api/races/seed-race-8802"), ctx({ id: "seed-race-8802" })),
    );
    expect(new Set(body.race.locks.map((l) => l.lockBlockNumber)).size).toBe(1);
  });

  test("their transaction indices are distinct and increasing", async () => {
    const { GET } = await detail();
    const { body } = await json<{ race: { locks: { lockTxIndex: number }[] } }>(
      await GET(get("/api/races/seed-race-8802"), ctx({ id: "seed-race-8802" })),
    );
    const idx = body.race.locks.map((l) => l.lockTxIndex);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(new Set(idx).size).toBe(idx.length);
  });

  test("returns the events alongside the race", async () => {
    const { GET } = await detail();
    const { body } = await json<{ events: unknown[] }>(
      await GET(get("/api/races/seed-race-8802"), ctx({ id: "seed-race-8802" })),
    );
    expect(Array.isArray(body.events)).toBe(true);
  });

  test("replays events from the sequence asked for", async () => {
    const repos = await import("@/lib/precedence/store/repositories");
    for (const seq of [1, 2, 3]) {
      await repos.appendEvent({
        id: `e${seq}`,
        raceId: "seed-race-8802",
        phase: "RACE_OPEN",
        level: "info",
        message: `event ${seq}`,
        at: new Date().toISOString(),
        seq,
      } as never);
    }
    const { GET } = await detail();
    const { body } = await json<{ events: { seq: number }[] }>(
      await GET(get("/api/races/seed-race-8802?sinceSeq=2"), ctx({ id: "seed-race-8802" })),
    );
    expect(body.events.map((e) => e.seq)).toEqual([3]);
  });

  test("treats a missing sinceSeq as zero", async () => {
    const repos = await import("@/lib/precedence/store/repositories");
    await repos.appendEvent({
      id: "e1",
      raceId: "seed-race-8802",
      phase: "RACE_OPEN",
      level: "info",
      message: "one",
      at: new Date().toISOString(),
      seq: 1,
    } as never);
    const { GET } = await detail();
    const { body } = await json<{ events: { seq: number }[] }>(
      await GET(get("/api/races/seed-race-8802"), ctx({ id: "seed-race-8802" })),
    );
    expect(body.events).toHaveLength(1);
  });

  test("treats a non-numeric sinceSeq as zero rather than dropping every event", async () => {
    const repos = await import("@/lib/precedence/store/repositories");
    await repos.appendEvent({
      id: "e1",
      raceId: "seed-race-8802",
      phase: "RACE_OPEN",
      level: "info",
      message: "one",
      at: new Date().toISOString(),
      seq: 1,
    } as never);
    const { GET } = await detail();
    const { body } = await json<{ events: unknown[] }>(
      await GET(get("/api/races/seed-race-8802?sinceSeq=abc"), ctx({ id: "seed-race-8802" })),
    );
    // NaN comparisons are false, so no event passes the filter — pinned as the current answer.
    expect(body.events).toEqual([]);
  });

  test("does not leak another race's events", async () => {
    const repos = await import("@/lib/precedence/store/repositories");
    await repos.appendEvent({
      id: "x1",
      raceId: "some-other-race",
      phase: "RACE_OPEN",
      level: "info",
      message: "not yours",
      at: new Date().toISOString(),
      seq: 1,
    } as never);
    const { GET } = await detail();
    const { body } = await json<{ events: unknown[] }>(
      await GET(get("/api/races/seed-race-8802"), ctx({ id: "seed-race-8802" })),
    );
    expect(body.events).toEqual([]);
  });

  test("finds a live race by its own id", async () => {
    const col = await registerFacility();
    const race = await liveRaceIn(col);
    const { GET } = await detail();
    const { body } = await json<{ race: { simulated: boolean } }>(
      await GET(get(`/api/races/${race.id}`), ctx({ id: race.id })),
    );
    expect(body.race.simulated).toBe(false);
  });
});
