/**
 * The collateral read routes: the list, one facility, its analysis and its refinance view.
 *
 * @remarks These four are the app's registry surface. The interesting properties are not "does it
 * return JSON" but the ones a careless change would break silently: a facility must be reachable
 * by its symbol as well as its id (every link in the UI uses one or the other), the analysis must
 * respect posted terms over its own suggestion, and provenance must come from the adapters rather
 * than a constant.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { deps, resetFakes } from "../helpers/fakes";
import { freshStore, registerFacility, scriptedRaceIn } from "../helpers/fixtures";
import { ctx, get, json } from "../helpers/http";

const list = () => import("@/app/api/collateral/route");
const detail = () => import("@/app/api/collateral/[id]/route");
const analyze = () => import("@/app/api/collateral/[id]/analyze/route");
const refinance = () => import("@/app/api/collateral/[id]/refinance/route");

interface Listed {
  ok: boolean;
  count: number;
  collateral: { id: string; symbol: string; status: string; faceValueUsd: number }[];
}

describe("GET /api/collateral", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("answers 200", async () => {
    const { GET } = await list();
    expect((await GET()).status).toBe(200);
  });

  test("reports ok", async () => {
    const { GET } = await list();
    const { body } = await json<Listed>(await GET());
    expect(body.ok).toBe(true);
  });

  test("returns the four seeded facilities", async () => {
    const { GET } = await list();
    const { body } = await json<Listed>(await GET());
    expect(body.collateral).toHaveLength(4);
  });

  test("count agrees with the array it describes", async () => {
    const { GET } = await list();
    const { body } = await json<Listed>(await GET());
    expect(body.count).toBe(body.collateral.length);
  });

  test("count follows a new registration", async () => {
    await registerFacility();
    const { GET } = await list();
    const { body } = await json<Listed>(await GET());
    expect(body.count).toBe(5);
  });

  test("puts a newly registered asset first, not buried under the fixtures", async () => {
    await registerFacility({ id: "col-newest", symbol: "NEWEST-1" });
    const { GET } = await list();
    const { body } = await json<Listed>(await GET());
    expect(body.collateral[0].id).toBe("col-newest");
  });

  test("every facility carries a status", async () => {
    const { GET } = await list();
    const { body } = await json<Listed>(await GET());
    for (const c of body.collateral) expect(typeof c.status).toBe("string");
  });

  test("the fixtures are labelled as samples, never as chain records", async () => {
    // Fixture hashes must stay visibly fake. A judge clicking a plausible-looking dead link is
    // the failure this rule exists to prevent.
    const { GET } = await list();
    const { body } = await json<Listed & { collateral: { docHash: string }[] }>(await GET());
    for (const c of body.collateral) expect(c.docHash).toContain("SAMPLE");
  });
});

describe("GET /api/collateral/:id", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("finds a facility by id", async () => {
    const { GET } = await detail();
    const { status, body } = await json<{ ok: boolean; collateral: { id: string } }>(
      await GET(get("/api/collateral/col-8802"), ctx({ id: "col-8802" })),
    );
    expect(status).toBe(200);
    expect(body.collateral.id).toBe("col-8802");
  });

  test("finds the same facility by symbol", async () => {
    const { GET } = await detail();
    const { body } = await json<{ collateral: { id: string } }>(
      await GET(get("/api/collateral/COFFEE-8802"), ctx({ id: "COFFEE-8802" })),
    );
    expect(body.collateral.id).toBe("col-8802");
  });

  test("404s for an unknown id", async () => {
    const { GET } = await detail();
    const { status, body } = await json<{ ok: boolean; error: string }>(
      await GET(get("/api/collateral/nope"), ctx({ id: "nope" })),
    );
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("not found");
  });

  test("404s for an empty id rather than returning the first facility", async () => {
    const { GET } = await detail();
    expect((await GET(get("/api/collateral/"), ctx({ id: "" }))).status).toBe(404);
  });

  test("awaits the params promise Next hands it", async () => {
    // A handler that forgot to await would read `undefined` and 404 a facility that exists.
    const { GET } = await detail();
    const res = await GET(get("/api/collateral/col-8803"), {
      params: new Promise((r) => setTimeout(() => r({ id: "col-8803" }), 5)),
    });
    expect(res.status).toBe(200);
  });

  test("includes the analysis alongside the facility", async () => {
    const { GET } = await detail();
    const { body } = await json<{ analysis: { collateralId: string; maxDrawUsd: number } }>(
      await GET(get("/api/collateral/col-8802"), ctx({ id: "col-8802" })),
    );
    expect(body.analysis.collateralId).toBe("col-8802");
    expect(body.analysis.maxDrawUsd).toBe(8500);
  });

  test("reports no race when none has been run", async () => {
    const { GET } = await detail();
    const { body } = await json<{ raceId: string | null; raceOutcome: string | null }>(
      await GET(get("/api/collateral/col-8804"), ctx({ id: "col-8804" })),
    );
    expect(body.raceId).toBeNull();
    expect(body.raceOutcome).toBeNull();
  });

  test("links the race that ran against this facility", async () => {
    const { GET } = await detail();
    const { body } = await json<{ raceId: string | null }>(
      await GET(get("/api/collateral/col-8802"), ctx({ id: "col-8802" })),
    );
    // The seeded history settles a race on 8802.
    expect(body.raceId).toBe("seed-race-8802");
  });

  test("matches a race by symbol, because a summary carries no collateral id", async () => {
    const col = await registerFacility({ id: "col-x", symbol: "MATCH-ME" });
    await scriptedRaceIn(col, { id: "scripted-match" });
    const { GET } = await detail();
    const { body } = await json<{ raceId: string | null }>(
      await GET(get("/api/collateral/col-x"), ctx({ id: "col-x" })),
    );
    expect(body.raceId).toBe("scripted-match");
  });

  test("reports provenance from the adapters, both simulated", async () => {
    const { GET } = await detail();
    const { body } = await json<{ live: { sepolia: boolean; creditcoin: boolean } }>(
      await GET(get("/api/collateral/col-8802"), ctx({ id: "col-8802" })),
    );
    expect(body.live).toEqual({ sepolia: false, creditcoin: false });
  });

  test("reports provenance from the adapters, both live", async () => {
    deps.sepoliaLive = true;
    deps.creditcoinLive = true;
    const { GET } = await detail();
    const { body } = await json<{ live: { sepolia: boolean; creditcoin: boolean } }>(
      await GET(get("/api/collateral/col-8802"), ctx({ id: "col-8802" })),
    );
    expect(body.live).toEqual({ sepolia: true, creditcoin: true });
  });

  test("reports each chain independently", async () => {
    deps.creditcoinLive = true;
    const { GET } = await detail();
    const { body } = await json<{ live: { sepolia: boolean; creditcoin: boolean } }>(
      await GET(get("/api/collateral/col-8802"), ctx({ id: "col-8802" })),
    );
    expect(body.live).toEqual({ sepolia: false, creditcoin: true });
  });
});

describe("GET /api/collateral/:id/analyze", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("404s for an unknown facility", async () => {
    const { GET } = await analyze();
    expect(
      (await GET(get("/api/collateral/nope/analyze"), ctx({ id: "nope" }))).status,
    ).toBe(404);
  });

  test("defaults to the facility's own requested amount", async () => {
    const { GET } = await analyze();
    const { body } = await json<{ analysis: { maxDrawUsd: number } }>(
      await GET(get("/api/collateral/col-8802/analyze"), ctx({ id: "col-8802" })),
    );
    expect(body.analysis.maxDrawUsd).toBe(8500);
  });

  test("derives the advance rate from the haircut", async () => {
    const { GET } = await analyze();
    const { body } = await json<{ analysis: { advanceRatePct: number } }>(
      await GET(get("/api/collateral/col-8802/analyze"), ctx({ id: "col-8802" })),
    );
    expect(body.analysis.advanceRatePct).toBe(85);
  });

  test("reports the haircut in dollars as well as percent", async () => {
    const { GET } = await analyze();
    const { body } = await json<{ analysis: { haircutUsd: number } }>(
      await GET(get("/api/collateral/col-8802/analyze"), ctx({ id: "col-8802" })),
    );
    expect(body.analysis.haircutUsd).toBe(1500);
  });

  test("honours an explicit amountUsd", async () => {
    const { GET } = await analyze();
    const { body } = await json<{ analysis: { suggestedTranches: { seniorUsd: number } } }>(
      await GET(get("/api/collateral/col-8802/analyze?amountUsd=5000"), ctx({ id: "col-8802" })),
    );
    expect(body.analysis.suggestedTranches.seniorUsd).toBe(3000);
  });

  test("caps the request at the advance the haircut allows", async () => {
    const { GET } = await analyze();
    const { body } = await json<{
      analysis: { suggestedTranches: { seniorUsd: number; juniorUsd: number; subordinateUsd: number } };
    }>(
      await GET(
        get("/api/collateral/col-8802/analyze?amountUsd=999999"),
        ctx({ id: "col-8802" }),
      ),
    );
    const t = body.analysis.suggestedTranches;
    expect(t.seniorUsd + t.juniorUsd + t.subordinateUsd).toBe(8500);
  });

  test("falls back to the facility amount for a non-numeric amountUsd", async () => {
    const { GET } = await analyze();
    const { body } = await json<{ analysis: { suggestedTranches: { seniorUsd: number } } }>(
      await GET(get("/api/collateral/col-8802/analyze?amountUsd=lots"), ctx({ id: "col-8802" })),
    );
    expect(body.analysis.suggestedTranches.seniorUsd).toBe(5100);
  });

  test("falls back to the facility amount for a zero amountUsd", async () => {
    const { GET } = await analyze();
    const { body } = await json<{ analysis: { suggestedTranches: { seniorUsd: number } } }>(
      await GET(get("/api/collateral/col-8802/analyze?amountUsd=0"), ctx({ id: "col-8802" })),
    );
    expect(body.analysis.suggestedTranches.seniorUsd).toBe(5100);
  });

  test("suggests ordinal rates, which is what the contract enforces", async () => {
    const { GET } = await analyze();
    const { body } = await json<{
      analysis: {
        suggestedTranches: {
          seniorRatePct: number;
          juniorRatePct: number;
          subordinateRatePct: number;
        };
      };
    }>(await GET(get("/api/collateral/col-8802/analyze"), ctx({ id: "col-8802" })));
    const t = body.analysis.suggestedTranches;
    expect(t.seniorRatePct).toBeLessThan(t.juniorRatePct);
    expect(t.juniorRatePct).toBeLessThan(t.subordinateRatePct);
  });

  test("says clear title only when the registry says so", async () => {
    const { GET } = await analyze();
    const clear = await json<{ analysis: { notes: string[] } }>(
      await GET(get("/api/collateral/col-8802/analyze"), ctx({ id: "col-8802" })),
    );
    expect(clear.body.analysis.notes.join(" ")).toContain("Verified clear title");

    const encumbered = await json<{ analysis: { notes: string[] } }>(
      await GET(get("/api/collateral/col-8803/analyze"), ctx({ id: "col-8803" })),
    );
    expect(encumbered.body.analysis.notes.join(" ")).toContain("Existing encumbrance");
  });

  test("names the custodian and its location in the notes", async () => {
    const { GET } = await analyze();
    const { body } = await json<{ analysis: { notes: string[] } }>(
      await GET(get("/api/collateral/col-8802/analyze"), ctx({ id: "col-8802" })),
    );
    expect(body.analysis.notes.join(" ")).toContain("Santos Port Terminal");
    expect(body.analysis.notes.join(" ")).toContain("Santos, Brazil");
  });

  test("prefers the target rate as the estimate when one is posted", async () => {
    const { GET } = await analyze();
    const { body } = await json<{ analysis: { estRatePct: number } }>(
      await GET(get("/api/collateral/col-8802/analyze"), ctx({ id: "col-8802" })),
    );
    expect(body.analysis.estRatePct).toBe(5.2);
  });

  test("falls back to the current rate when there is no target", async () => {
    const col = await registerFacility({ id: "col-notarget", targetRatePct: 0, currentRatePct: 9.5 });
    const { GET } = await analyze();
    const { body } = await json<{ analysis: { estRatePct: number } }>(
      await GET(get(`/api/collateral/${col.id}/analyze`), ctx({ id: col.id })),
    );
    expect(body.analysis.estRatePct).toBe(9.5);
  });

  test("works through the symbol too", async () => {
    const { GET } = await analyze();
    expect(
      (await GET(get("/api/collateral/WHEAT-8803/analyze"), ctx({ id: "WHEAT-8803" }))).status,
    ).toBe(200);
  });
});

describe("GET /api/collateral/:id/refinance", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("404s for an unknown facility", async () => {
    const { GET } = await refinance();
    expect(
      (await GET(get("/api/collateral/nope/refinance"), ctx({ id: "nope" }))).status,
    ).toBe(404);
  });

  test("finds an opportunity where the spread is wide enough", async () => {
    // 8802 pays 8.0% against a 5.2% target: 280 bps.
    const { GET } = await refinance();
    const { status, body } = await json<{ ok: boolean; opportunity: { spreadSavingsBps: number } }>(
      await GET(get("/api/collateral/col-8802/refinance"), ctx({ id: "col-8802" })),
    );
    expect(status).toBe(200);
    expect(body.opportunity.spreadSavingsBps).toBe(280);
  });

  test("names the obligor on the opportunity", async () => {
    const { GET } = await refinance();
    const { body } = await json<{ opportunity: { obligor: string } }>(
      await GET(get("/api/collateral/col-8802/refinance"), ctx({ id: "col-8802" })),
    );
    expect(body.opportunity.obligor).toBe("Atlas Coffee Importers LLC");
  });

  test("quotes the annual saving on the notional it assumed", async () => {
    const { GET } = await refinance();
    const { body } = await json<{ opportunity: { annualSavingsUsd: number; notionalUsd: number } }>(
      await GET(get("/api/collateral/col-8802/refinance"), ctx({ id: "col-8802" })),
    );
    expect(body.opportunity.notionalUsd).toBe(5000);
    expect(body.opportunity.annualSavingsUsd).toBe(140);
  });

  test("returns null rather than a marginal opportunity below 100 bps", async () => {
    // 8803 pays 6.8% against 5.8%: exactly 100 bps, which the rule excludes.
    const { GET } = await refinance();
    const { status, body } = await json<{ ok: boolean; opportunity: unknown }>(
      await GET(get("/api/collateral/col-8803/refinance"), ctx({ id: "col-8803" })),
    );
    expect(status).toBe(200);
    expect(body.opportunity).toBeNull();
  });

  test("`top` mirrors `opportunity`", async () => {
    const { GET } = await refinance();
    const { body } = await json<{ opportunity: unknown; top: unknown }>(
      await GET(get("/api/collateral/col-8802/refinance"), ctx({ id: "col-8802" })),
    );
    expect(body.top).toEqual(body.opportunity);
  });

  test("mirrors a null opportunity too", async () => {
    const { GET } = await refinance();
    const { body } = await json<{ opportunity: unknown; top: unknown }>(
      await GET(get("/api/collateral/col-8803/refinance"), ctx({ id: "col-8803" })),
    );
    expect(body.top).toBeNull();
  });

  test("works through the symbol", async () => {
    const { GET } = await refinance();
    expect(
      (await GET(get("/api/collateral/COFFEE-8802/refinance"), ctx({ id: "COFFEE-8802" }))).status,
    ).toBe(200);
  });

  test("finds nothing when the facility already pays the market rate", async () => {
    const col = await registerFacility({ id: "col-cheap", currentRatePct: 5.0, targetRatePct: 5.2 });
    const { GET } = await refinance();
    const { body } = await json<{ opportunity: unknown }>(
      await GET(get(`/api/collateral/${col.id}/refinance`), ctx({ id: col.id })),
    );
    expect(body.opportunity).toBeNull();
  });
});
