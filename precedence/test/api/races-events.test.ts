/**
 * `GET /api/races/:id/events` — the lifecycle event stream.
 *
 * @remarks Everything here is about one bug and its two causes. `EventSource` cannot tell a
 * server that has nothing left to send from a connection that dropped, so it reconnects — about
 * three seconds later, forever. A settled race with no stored events therefore closed instantly
 * on every attempt and the browser reopened it indefinitely: measured at six requests per twenty
 * seconds, for a race that had been over for days.
 *
 * The fix is the `done` event, and it has to be sent on *both* terminal paths: a race that has
 * finished, and a race that no longer exists at all. The second one is easy to miss —
 * `POST /api/admin/reset` can delete a race under an open tab, and without the `!r` check the
 * route fell through to a live subscription and held a connection open forever for an id that was
 * gone.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { resetFakes } from "../helpers/fakes";
import { freshStore, liveRaceIn, registerFacility, scriptedRaceIn } from "../helpers/fixtures";
import { ctx, get, readSse, sseEvents } from "../helpers/http";

const route = () => import("@/app/api/races/[id]/events/route");

async function stream(id: string, query = "") {
  const { GET } = await route();
  return GET(get(`/api/races/${id}/events${query}`), ctx({ id }));
}

async function streamWithHeaders(id: string, headers: Record<string, string>) {
  const { GET } = await route();
  return GET(get(`/api/races/${id}/events`, headers), ctx({ id }));
}

/** Append `n` events to a race so the replay has something to replay. */
async function seedEvents(raceId: string, n: number, phase = "RACE_OPEN") {
  const repos = await import("@/lib/precedence/store/repositories");
  for (let seq = 1; seq <= n; seq++) {
    await repos.appendEvent({
      id: `${raceId}-evt-${seq}`,
      raceId,
      phase,
      level: "info",
      message: `event ${seq}`,
      at: new Date().toISOString(),
      seq,
    } as never);
  }
}

describe("GET /api/races/:id/events", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  describe("the response envelope", () => {
    test("answers 200", async () => {
      const res = await stream("seed-race-8802");
      expect(res.status).toBe(200);
      await res.body?.cancel();
    });

    test("declares an event stream", async () => {
      const res = await stream("seed-race-8802");
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      await res.body?.cancel();
    });

    test("declares a charset, because a proxy that guesses gets it wrong", async () => {
      const res = await stream("seed-race-8802");
      expect(res.headers.get("content-type")).toContain("charset=utf-8");
      await res.body?.cancel();
    });

    test("forbids caching and transformation", async () => {
      const res = await stream("seed-race-8802");
      expect(res.headers.get("cache-control")).toContain("no-cache");
      expect(res.headers.get("cache-control")).toContain("no-transform");
      await res.body?.cancel();
    });

    test("disables proxy buffering, or nothing arrives until the stream ends", async () => {
      const res = await stream("seed-race-8802");
      expect(res.headers.get("x-accel-buffering")).toBe("no");
      await res.body?.cancel();
    });

    test("answers 200 even for a race that does not exist", async () => {
      // A 404 would be reasonable HTTP and wrong here: EventSource retries a failed connection,
      // so the only way to stop the loop is a successful stream that says it is finished.
      const res = await stream("no-such-race");
      expect(res.status).toBe(200);
      await res.body?.cancel();
    });
  });

  describe("a race that no longer exists", () => {
    test("says done rather than closing silently", async () => {
      const { frames } = await readSse(await stream("no-such-race"));
      expect(sseEvents(frames)).toEqual(["done"]);
    });

    test("closes the stream", async () => {
      const { closed } = await readSse(await stream("no-such-race"));
      expect(closed).toBe(true);
    });

    test("sends nothing but the done frame", async () => {
      const { frames } = await readSse(await stream("no-such-race"));
      expect(frames).toHaveLength(1);
    });

    test("does the same after the store is reset under an open tab", async () => {
      const col = await registerFacility({ id: "col-doomed" });
      const race = await scriptedRaceIn(col, { id: "doomed-1" });
      await freshStore();
      const { frames, closed } = await readSse(await stream(race.id));
      expect(sseEvents(frames)).toEqual(["done"]);
      expect(closed).toBe(true);
    });
  });

  describe("a race that has finished", () => {
    test("closes with done", async () => {
      const { frames, closed } = await readSse(await stream("seed-race-8802"));
      expect(sseEvents(frames).at(-1)).toBe("done");
      expect(closed).toBe(true);
    });

    test("replays its stored events before saying done", async () => {
      await seedEvents("seed-race-8802", 3, "PRIORITY_SETTLED");
      const { frames } = await readSse(await stream("seed-race-8802"));
      expect(sseEvents(frames)).toEqual([
        "PRIORITY_SETTLED",
        "PRIORITY_SETTLED",
        "PRIORITY_SETTLED",
        "done",
      ]);
    });

    test("closes even with no stored events, which is the case that looped", async () => {
      const { frames, closed } = await readSse(await stream("seed-race-8802"));
      expect(frames).toHaveLength(1);
      expect(closed).toBe(true);
    });

    for (const status of ["SETTLED_CLOSED", "TERMINATED_DEFAULT", "AUTO_REFUND", "ABORTED"]) {
      test(`treats ${status} as finished`, async () => {
        const col = await registerFacility({ id: `col-${status}` });
        await scriptedRaceIn(col, { id: `race-${status}`, status: status as never });
        const { closed } = await readSse(await stream(`race-${status}`));
        expect(closed).toBe(true);
      });
    }
  });

  describe("a race that is still running", () => {
    test("stays open after the replay", async () => {
      const col = await registerFacility({ id: "col-open" });
      await scriptedRaceIn(col, { id: "open-1", status: "RACE_OPEN" as never });
      const { closed } = await readSse(await stream("open-1"), { timeoutMs: 120 });
      expect(closed).toBe(false);
    });

    test("replays what is already stored", async () => {
      const col = await registerFacility({ id: "col-open" });
      await scriptedRaceIn(col, { id: "open-1", status: "RACE_OPEN" as never });
      await seedEvents("open-1", 2);
      const { frames } = await readSse(await stream("open-1"), { timeoutMs: 120 });
      expect(sseEvents(frames)).toEqual(["RACE_OPEN", "RACE_OPEN"]);
    });

    test("sends no done frame while there is more to come", async () => {
      const col = await registerFacility({ id: "col-open" });
      await scriptedRaceIn(col, { id: "open-1", status: "RACE_OPEN" as never });
      const { frames } = await readSse(await stream("open-1"), { timeoutMs: 120 });
      expect(sseEvents(frames)).not.toContain("done");
    });

    test("delivers an event emitted after the stream opened", async () => {
      const col = await registerFacility({ id: "col-open" });
      await scriptedRaceIn(col, { id: "open-1", status: "RACE_OPEN" as never });
      const res = await stream("open-1");
      const reading = readSse(res, { timeoutMs: 400 });
      const { emitEvent } = await import("@/lib/precedence/orchestrator/events");
      await emitEvent("open-1", "CAPITAL_DRAWN", "info", "drawn");
      const { frames } = await reading;
      expect(sseEvents(frames)).toContain("CAPITAL_DRAWN");
    });

    test("says done and closes when a terminal event arrives", async () => {
      const col = await registerFacility({ id: "col-open" });
      await scriptedRaceIn(col, { id: "open-1", status: "ENCUMBERED" as never });
      const res = await stream("open-1");
      const reading = readSse(res, { timeoutMs: 500 });
      const { emitEvent } = await import("@/lib/precedence/orchestrator/events");
      await emitEvent("open-1", "SETTLED_CLOSED", "success", "finished");
      const { frames, closed } = await reading;
      expect(sseEvents(frames)).toContain("SETTLED_CLOSED");
      expect(sseEvents(frames).at(-1)).toBe("done");
      expect(closed).toBe(true);
    });

    test("does not deliver another race's events", async () => {
      const col = await registerFacility({ id: "col-open" });
      await scriptedRaceIn(col, { id: "open-1", status: "RACE_OPEN" as never });
      const res = await stream("open-1");
      const reading = readSse(res, { timeoutMs: 300 });
      const { emitEvent } = await import("@/lib/precedence/orchestrator/events");
      await emitEvent("someone-else", "CAPITAL_DRAWN", "info", "not yours");
      const { frames } = await reading;
      expect(sseEvents(frames)).toEqual([]);
    });
  });

  describe("resuming", () => {
    test("replays from the sinceSeq query", async () => {
      await seedEvents("seed-race-8802", 4);
      const { frames } = await readSse(await stream("seed-race-8802", "?sinceSeq=2"));
      // Two replayed events, then done.
      expect(frames).toHaveLength(3);
    });

    test("replays from the Last-Event-ID header, which is what EventSource sends", async () => {
      await seedEvents("seed-race-8802", 4);
      const { frames } = await readSse(
        await streamWithHeaders("seed-race-8802", { "last-event-id": "3" }),
      );
      expect(frames).toHaveLength(2);
    });

    test("prefers the header over the query", async () => {
      await seedEvents("seed-race-8802", 4);
      const { GET } = await route();
      const res = await GET(
        get("/api/races/seed-race-8802/events?sinceSeq=0", { "last-event-id": "4" }),
        ctx({ id: "seed-race-8802" }),
      );
      const { frames } = await readSse(res);
      expect(frames).toHaveLength(1);
    });

    test("replays everything when nothing is given", async () => {
      await seedEvents("seed-race-8802", 4);
      const { frames } = await readSse(await stream("seed-race-8802"));
      expect(frames).toHaveLength(5);
    });
  });

  describe("frame format", () => {
    test("tags each frame with the event's sequence, so a resume can be exact", async () => {
      await seedEvents("seed-race-8802", 1);
      const { frames } = await readSse(await stream("seed-race-8802"));
      expect(frames[0]).toContain("id: 1");
    });

    test("names the phase as the event type", async () => {
      await seedEvents("seed-race-8802", 1, "PRIORITY_SETTLED");
      const { frames } = await readSse(await stream("seed-race-8802"));
      expect(frames[0]).toContain("event: PRIORITY_SETTLED");
    });

    test("carries the whole event as JSON in the data line", async () => {
      await seedEvents("seed-race-8802", 1);
      const { frames } = await readSse(await stream("seed-race-8802"));
      const data = frames[0].split("\n").find((l) => l.startsWith("data: "))!.slice(6);
      expect(JSON.parse(data)).toMatchObject({ raceId: "seed-race-8802", seq: 1 });
    });

    test("the done frame carries an empty object, not nothing", async () => {
      const { frames } = await readSse(await stream("seed-race-8802"));
      expect(frames.at(-1)).toContain("data: {}");
    });

    test("a live race's stream frames are identical in shape", async () => {
      const col = await registerFacility();
      const race = await liveRaceIn(col, { status: "RACE_OPEN" });
      await seedEvents(race.id, 1);
      const { frames } = await readSse(await stream(race.id), { timeoutMs: 150 });
      expect(frames[0]).toContain("event: RACE_OPEN");
    });
  });
});
