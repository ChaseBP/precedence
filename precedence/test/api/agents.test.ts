/**
 * The financier routes: `/api/agents`, `/api/financiers` and their `:id` details.
 *
 * @remarks `/api/financiers` exists because the domain was renamed and the older path is still
 * linked; the two return the same body from the same repository. That is worth a test rather than
 * a comment — the moment they drift, half the UI reads one shape and half reads another, and the
 * symptom appears somewhere else entirely.
 *
 * The registry addresses in these responses are deliberate `SAMPLE` placeholders: no identity or
 * reputation registry is deployed, and a plausible-looking address here would be an invented
 * contract presented as real.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { deps, resetFakes } from "../helpers/fakes";
import { freshStore } from "../helpers/fixtures";
import { ctx, get, json } from "../helpers/http";

const agents = () => import("@/app/api/agents/route");
const agentDetail = () => import("@/app/api/agents/[id]/route");
const financiers = () => import("@/app/api/financiers/route");
const financierDetail = () => import("@/app/api/financiers/[id]/route");

interface ListBody {
  ok: boolean;
  agents: { id: string; name: string; policy: { preferredTranche: string }; balanceUsd: number }[];
  registries: { identity: string; reputation: string };
  creditcoinLive: boolean;
}

describe("GET /api/agents", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("answers 200", async () => {
    const { GET } = await agents();
    expect((await GET()).status).toBe(200);
  });

  test("reports ok", async () => {
    const { GET } = await agents();
    const { body } = await json<ListBody>(await GET());
    expect(body.ok).toBe(true);
  });

  test("returns the four seeded financiers", async () => {
    const { GET } = await agents();
    const { body } = await json<ListBody>(await GET());
    expect(body.agents.map((a) => a.id).sort()).toEqual([
      "kestrel",
      "meridian",
      "novum",
      "vector",
    ]);
  });

  test("every financier carries a policy", async () => {
    const { GET } = await agents();
    const { body } = await json<ListBody>(await GET());
    for (const a of body.agents) expect(a.policy).toBeDefined();
  });

  test("the three lenders declare different tranche preferences", async () => {
    // Rivals, not a syndicate — three lenders wanting the same rank is the contention the
    // protocol resolves, so they must not all prefer one tranche.
    const { GET } = await agents();
    const { body } = await json<ListBody>(await GET());
    const prefs = body.agents
      .filter((a) => a.policy?.preferredTranche)
      .map((a) => a.policy.preferredTranche);
    expect(new Set(prefs).size).toBeGreaterThan(1);
  });

  test("labels the identity registry as a sample, because none is deployed", async () => {
    const { GET } = await agents();
    const { body } = await json<ListBody>(await GET());
    expect(body.registries.identity).toContain("SAMPLE");
  });

  test("labels the reputation registry as a sample too", async () => {
    const { GET } = await agents();
    const { body } = await json<ListBody>(await GET());
    expect(body.registries.reputation).toContain("SAMPLE");
  });

  test("the two registry placeholders are distinguishable", async () => {
    const { GET } = await agents();
    const { body } = await json<ListBody>(await GET());
    expect(body.registries.identity).not.toBe(body.registries.reputation);
  });

  test("reports Creditcoin as simulated by default", async () => {
    const { GET } = await agents();
    const { body } = await json<ListBody>(await GET());
    expect(body.creditcoinLive).toBe(false);
  });

  test("reports Creditcoin live when the adapter says so", async () => {
    deps.creditcoinLive = true;
    const { GET } = await agents();
    const { body } = await json<ListBody>(await GET());
    expect(body.creditcoinLive).toBe(true);
  });

  test("does not read liveness from Sepolia's adapter", async () => {
    deps.sepoliaLive = true;
    const { GET } = await agents();
    const { body } = await json<ListBody>(await GET());
    expect(body.creditcoinLive).toBe(false);
  });

  test("never exposes a private key", async () => {
    const { GET } = await agents();
    const raw = JSON.stringify(await (await GET()).json());
    expect(raw).not.toMatch(/privateKey|PRIVATE_KEY|_PK"/);
  });
});

describe("GET /api/agents/:id", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("returns one financier", async () => {
    const { GET } = await agentDetail();
    const { status, body } = await json<{ ok: boolean; agent: { id: string; name: string } }>(
      await GET(get("/api/agents/meridian"), ctx({ id: "meridian" })),
    );
    expect(status).toBe(200);
    expect(body.agent.name).toBe("Meridian");
  });

  test("404s an unknown id", async () => {
    const { GET } = await agentDetail();
    const { status, body } = await json<{ ok: boolean; error: string }>(
      await GET(get("/api/agents/nobody"), ctx({ id: "nobody" })),
    );
    expect(status).toBe(404);
    expect(body.error).toBe("not found");
  });

  test("404s an empty id", async () => {
    const { GET } = await agentDetail();
    expect((await GET(get("/api/agents/"), ctx({ id: "" }))).status).toBe(404);
  });

  test("is case sensitive, matching the stored id exactly", async () => {
    const { GET } = await agentDetail();
    expect((await GET(get("/api/agents/MERIDIAN"), ctx({ id: "MERIDIAN" }))).status).toBe(404);
  });

  test("carries the reputation record", async () => {
    const { GET } = await agentDetail();
    const { body } = await json<{ agent: { reputation: { verifiedProofs: number } } }>(
      await GET(get("/api/agents/meridian"), ctx({ id: "meridian" })),
    );
    expect(body.agent.reputation.verifiedProofs).toBe(18);
  });

  test("carries the prover, which is a financier record too", async () => {
    const { GET } = await agentDetail();
    const { body } = await json<{ agent: { role: string } }>(
      await GET(get("/api/agents/kestrel"), ctx({ id: "kestrel" })),
    );
    expect(body.agent.role).toBeDefined();
  });

  test("awaits the params promise", async () => {
    const { GET } = await agentDetail();
    const res = await GET(get("/api/agents/vector"), {
      params: new Promise((r) => setTimeout(() => r({ id: "vector" }), 5)),
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/financiers — the alias for /api/agents", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("answers 200", async () => {
    const { GET } = await financiers();
    expect((await GET()).status).toBe(200);
  });

  test("returns exactly what /api/agents returns", async () => {
    const a = await json<ListBody>(await (await agents()).GET());
    const f = await json<ListBody>(await (await financiers()).GET());
    expect(f.body).toEqual(a.body);
  });

  test("tracks the adapter the same way", async () => {
    deps.creditcoinLive = true;
    const { body } = await json<ListBody>(await (await financiers()).GET());
    expect(body.creditcoinLive).toBe(true);
  });

  test("its detail route agrees with the agents detail route", async () => {
    const a = await json(
      await (await agentDetail()).GET(get("/api/agents/novum"), ctx({ id: "novum" })),
    );
    const f = await json(
      await (await financierDetail()).GET(get("/api/financiers/novum"), ctx({ id: "novum" })),
    );
    expect(f.body).toEqual(a.body);
  });

  test("its detail route 404s the same way", async () => {
    const { GET } = await financierDetail();
    expect((await GET(get("/api/financiers/x"), ctx({ id: "x" }))).status).toBe(404);
  });
});
