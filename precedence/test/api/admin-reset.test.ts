/**
 * `POST /api/admin/reset` — wipe the store back to the seed.
 *
 * @remarks Two things to hold onto. The token check is opt-in: with no `PRECEDENCE_ADMIN_TOKEN`
 * the endpoint is open, which is correct for a local demo and would be wrong on a public host, so
 * the behaviour is pinned rather than left to be discovered.
 *
 * And the reset has to clear the *adapters* as well as the database. The mock vault keeps a
 * per-collateral lock counter; without `resetDeps()` the next race inherits the previous one's
 * `seq` values, and `seq` contiguity is one of the invariants the settlement proof rests on.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetFakes } from "../helpers/fakes";
import { freshStore, registerFacility } from "../helpers/fixtures";
import { json, post } from "../helpers/http";

const route = () => import("@/app/api/admin/reset/route");

describe("POST /api/admin/reset", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
    delete process.env.PRECEDENCE_ADMIN_TOKEN;
  });

  afterEach(() => {
    delete process.env.PRECEDENCE_ADMIN_TOKEN;
  });

  describe("with no token configured", () => {
    test("answers 200", async () => {
      const { POST } = await route();
      expect((await POST(post("/api/admin/reset"))).status).toBe(200);
    });

    test("confirms the reset", async () => {
      const { POST } = await route();
      const { body } = await json<{ ok: boolean; message: string }>(
        await POST(post("/api/admin/reset")),
      );
      expect(body.ok).toBe(true);
      expect(body.message).toBe("reset complete");
    });

    test("ignores a header nobody asked for", async () => {
      const { POST } = await route();
      const res = await POST(
        post("/api/admin/reset", undefined, { "x-precedence-admin": "whatever" }),
      );
      expect(res.status).toBe(200);
    });

    test("treats an empty token as no token", async () => {
      process.env.PRECEDENCE_ADMIN_TOKEN = "";
      const { POST } = await route();
      expect((await POST(post("/api/admin/reset"))).status).toBe(200);
    });
  });

  describe("with a token configured", () => {
    beforeEach(() => {
      process.env.PRECEDENCE_ADMIN_TOKEN = "let-me-in";
    });

    test("accepts the matching header", async () => {
      const { POST } = await route();
      const res = await POST(
        post("/api/admin/reset", undefined, { "x-precedence-admin": "let-me-in" }),
      );
      expect(res.status).toBe(200);
    });

    test("401s a missing header", async () => {
      const { POST } = await route();
      const { status, body } = await json<{ ok: boolean; error: string }>(
        await POST(post("/api/admin/reset")),
      );
      expect(status).toBe(401);
      expect(body.error).toBe("unauthorized");
    });

    test("401s a wrong header", async () => {
      const { POST } = await route();
      expect(
        (await POST(post("/api/admin/reset", undefined, { "x-precedence-admin": "nope" })))
          .status,
      ).toBe(401);
    });

    test("401s an empty header value", async () => {
      const { POST } = await route();
      expect(
        (await POST(post("/api/admin/reset", undefined, { "x-precedence-admin": "" }))).status,
      ).toBe(401);
    });

    test("still matches a padded header, because HTTP strips the padding", async () => {
      // Not the route being lenient: the fetch spec trims leading and trailing whitespace from a
      // header value, so the comparison here never sees the spaces. Pinned so a future change to
      // trim the token in the route is understood as redundant rather than as a fix.
      const { POST } = await route();
      expect(
        (await POST(post("/api/admin/reset", undefined, { "x-precedence-admin": " let-me-in " })))
          .status,
      ).toBe(200);
    });

    test("compares case sensitively", async () => {
      const { POST } = await route();
      expect(
        (await POST(post("/api/admin/reset", undefined, { "x-precedence-admin": "LET-ME-IN" })))
          .status,
      ).toBe(401);
    });

    test("matches the header name case-insensitively, as HTTP requires", async () => {
      const { POST } = await route();
      expect(
        (await POST(post("/api/admin/reset", undefined, { "X-Precedence-Admin": "let-me-in" })))
          .status,
      ).toBe(200);
    });

    test("changes nothing when it refuses", async () => {
      await registerFacility({ id: "col-survivor" });
      const { POST } = await route();
      await POST(post("/api/admin/reset"));
      const repos = await import("@/lib/precedence/store/repositories");
      expect(await repos.getCollateral("col-survivor")).toBeDefined();
    });
  });

  describe("what the reset actually clears", () => {
    test("drops a registered facility", async () => {
      await registerFacility({ id: "col-temp" });
      const { POST } = await route();
      await POST(post("/api/admin/reset"));
      const repos = await import("@/lib/precedence/store/repositories");
      expect(await repos.getCollateral("col-temp")).toBeUndefined();
    });

    test("restores the seeded facilities", async () => {
      const { POST } = await route();
      await POST(post("/api/admin/reset"));
      const repos = await import("@/lib/precedence/store/repositories");
      expect((await repos.listCollateral()).map((c) => c.id)).toEqual([
        "col-8802",
        "col-8803",
        "col-8804",
        "col-8805",
      ]);
    });

    test("drops a race that was saved", async () => {
      const col = await registerFacility({ id: "col-raced" });
      const { liveRaceIn } = await import("../helpers/fixtures");
      const race = await liveRaceIn(col);
      const { POST } = await route();
      await POST(post("/api/admin/reset"));
      const repos = await import("@/lib/precedence/store/repositories");
      expect(await repos.getRace(race.id)).toBeUndefined();
    });

    test("restores the seeded race history", async () => {
      const { POST } = await route();
      await POST(post("/api/admin/reset"));
      const repos = await import("@/lib/precedence/store/repositories");
      expect(await repos.getRace("seed-race-8802")).toBeDefined();
    });

    test("restores the seeded attestation", async () => {
      const { POST } = await route();
      await POST(post("/api/admin/reset"));
      const repos = await import("@/lib/precedence/store/repositories");
      expect(await repos.listAttestations()).toHaveLength(1);
    });

    test("clears events, so an open stream cannot replay a dead race", async () => {
      const repos = await import("@/lib/precedence/store/repositories");
      await repos.appendEvent({
        raceId: "ghost",
        seq: 1,
        phase: "RACE_OPEN",
        message: "x",
        at: new Date().toISOString(),
      } as never);
      const { POST } = await route();
      await POST(post("/api/admin/reset"));
      expect(await repos.getEventsSince("ghost", 0)).toEqual([]);
    });

    test("rebuilds the adapters, so vault lock counters do not carry over", async () => {
      const config = await import("@/lib/precedence/config");
      const before = config.getDeps();
      const { POST } = await route();
      await POST(post("/api/admin/reset"));
      // A fresh dependency graph, not the cached one — `seq` contiguity depends on it.
      expect(config.getDeps().sepolia).not.toBe(before.sepolia);
    });

    test("is idempotent", async () => {
      const { POST } = await route();
      await POST(post("/api/admin/reset"));
      const second = await POST(post("/api/admin/reset"));
      expect(second.status).toBe(200);
      const repos = await import("@/lib/precedence/store/repositories");
      expect(await repos.listCollateral()).toHaveLength(4);
    });

    test("does not require a body", async () => {
      const { POST } = await route();
      expect((await POST(new Request("http://t/api/admin/reset", { method: "POST" }))).status).toBe(
        200,
      );
    });
  });
});
