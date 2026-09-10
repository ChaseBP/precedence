/**
 * `GET /api/portfolio?address=…` — everything one wallet holds, on both sides of the book.
 *
 * @remarks Role is derived from on-chain facts, never declared, and that is the property most of
 * these tests protect. There is no signup and no role picker: an address holding a claim is a
 * lender, an address owning registered collateral is a borrower, and the interesting participant
 * is both at once. A mutable profile field in front of that would be wrong for exactly the case
 * the protocol is for.
 *
 * The second property is that a wallet with no history is not an error. It gets `role: "new"` and
 * empty arrays, because the UI uses that to offer the two things such a visitor can do.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { deps, resetFakes } from "../helpers/fakes";
import { freshStore, registerFacility, settlementRecord } from "../helpers/fixtures";
import { get, json } from "../helpers/http";

const route = () => import("@/app/api/portfolio/route");

/** The seeded settled race's participants. Derived, so a change to the derivation is caught. */
async function addresses() {
  const { financierAddress } = await import("@precedence/sdk/domain/lock");
  return {
    meridian: financierAddress("meridian"),
    vector: financierAddress("vector"),
    novum: financierAddress("novum"),
  };
}

const STRANGER = "0x" + "ef".repeat(20);

interface Body {
  ok: boolean;
  error?: string;
  address: string;
  role: "new" | "lender" | "borrower" | "both";
  live: { sepolia: boolean; creditcoin: boolean };
  lending: {
    collateralId: string;
    title: string;
    tranche: string;
    priorityRank: number;
    principalUsd: number;
    ratePct: number;
    tokenId: string;
    provenAt: { blockNumber: number; txIndex: number; seq: number };
    state: string;
    raceId: string;
    raceStatus: string;
  }[];
  refunded: { collateralId: string; tranche: string; amountUsd: number; reason: string }[];
  borrowing: {
    collateralId: string;
    title: string;
    assetType: string;
    faceValueUsd: number;
    maxAdvanceUsd: number;
    status: string;
    termsPosted: boolean;
    drawnUsd: number;
    repaidUsd: number;
    activeClaims: number;
    raceId?: string;
    raceStatus?: string;
  }[];
  totals: {
    lentUsd: number;
    refundedUsd: number;
    borrowedUsd: number;
    blendedRatePct: number;
  };
  counts: { lending: number; borrowing: number; refunded: number };
  unknownCollateral?: string;
}

async function portfolio(address?: string) {
  const { GET } = await route();
  const path = address === undefined ? "/api/portfolio" : `/api/portfolio?address=${address}`;
  return json<Body>(await GET(get(path)));
}

describe("GET /api/portfolio", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  describe("the address parameter", () => {
    test("400s with no address", async () => {
      const { status, body } = await portfolio();
      expect(status).toBe(400);
      expect(body.error).toContain("address query parameter is required");
    });

    test("400s on an empty address", async () => {
      const { status } = await portfolio("");
      expect(status).toBe(400);
    });

    test("echoes the address it was asked about", async () => {
      const { body } = await portfolio(STRANGER);
      expect(body.address).toBe(STRANGER);
    });

    test("does not validate the address shape — an unknown one is simply empty", async () => {
      const { status, body } = await portfolio("not-an-address");
      expect(status).toBe(200);
      expect(body.role).toBe("new");
    });
  });

  describe("a wallet with no history", () => {
    test("answers 200", async () => {
      const { status } = await portfolio(STRANGER);
      expect(status).toBe(200);
    });

    test("gets role new rather than an error", async () => {
      const { body } = await portfolio(STRANGER);
      expect(body.role).toBe("new");
    });

    test("has empty positions on both sides", async () => {
      const { body } = await portfolio(STRANGER);
      expect(body.lending).toEqual([]);
      expect(body.borrowing).toEqual([]);
      expect(body.refunded).toEqual([]);
    });

    test("has zero totals", async () => {
      const { body } = await portfolio(STRANGER);
      expect(body.totals).toEqual({
        lentUsd: 0,
        refundedUsd: 0,
        borrowedUsd: 0,
        blendedRatePct: 0,
      });
    });

    test("has zero counts", async () => {
      const { body } = await portfolio(STRANGER);
      expect(body.counts).toEqual({ lending: 0, borrowing: 0, refunded: 0 });
    });
  });

  describe("a lender", () => {
    test("is recognised from a claim it holds", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.meridian);
      expect(body.role).toBe("lender");
    });

    test("sees the claim", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.meridian);
      expect(body.lending).toHaveLength(1);
      expect(body.lending[0].tranche).toBe("SENIOR");
    });

    test("sees the proven position that won the rank", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.meridian);
      expect(body.lending[0].provenAt).toEqual({ blockNumber: 6182101, txIndex: 17, seq: 1 });
    });

    test("sees its priority rank", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.meridian);
      expect(body.lending[0].priorityRank).toBe(1);
    });

    test("a junior holder gets rank two on the same facility", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.vector);
      expect(body.lending[0].tranche).toBe("JUNIOR");
      expect(body.lending[0].priorityRank).toBe(2);
    });

    test("carries the facility title, not just its id", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.meridian);
      expect(body.lending[0].title).toContain("Coffee");
    });

    test("links back to the race that settled it", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.meridian);
      expect(body.lending[0].raceId).toBe("seed-race-8802");
      expect(body.lending[0].raceStatus).toBe("SETTLED_CLOSED");
    });

    test("matches the address case-insensitively", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.meridian.toUpperCase().replace("0X", "0x"));
      expect(body.lending).toHaveLength(1);
    });

    test("totals the principal it has out", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.meridian);
      expect(body.totals.lentUsd).toBe(5100);
    });

    test("counts its positions", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.meridian);
      expect(body.counts.lending).toBe(1);
    });

    test("reports no blended rate on a repaid book, because nothing is earning", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.meridian);
      expect(body.lending[0].state).toBe("REPAID");
      expect(body.totals.blendedRatePct).toBe(0);
    });

    test("blends the coupon across active claims, weighted by principal", async () => {
      const repos = await import("@/lib/precedence/store/repositories");
      const race = (await repos.getRace("seed-race-8802"))!;
      const claims = race.claims!.map((c) => ({ ...c, state: "ACTIVE" as const }));
      await repos.saveRace({ ...race, claims });
      const a = await addresses();
      // Senior alone: 5100 at 5%.
      const senior = await portfolio(a.meridian);
      expect(senior.body.totals.blendedRatePct).toBe(5);
    });
  });

  describe("a refunded bid, which is a real outcome and not an absence", () => {
    test("is reported for the outpaced financier", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.novum);
      expect(body.refunded).toHaveLength(1);
    });

    test("names the tranche the capital was bid into", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.novum);
      expect(body.refunded[0].tranche).toBe("SENIOR");
    });

    test("carries the full amount, reclaimable rather than demoted", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.novum);
      expect(body.refunded[0].amountUsd).toBe(5100);
    });

    test("explains that a senior bid does not consent to subordinate risk", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.novum);
      expect(body.refunded[0].reason).toContain("not demoted");
    });

    test("totals the refunded capital separately from the lent capital", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.novum);
      expect(body.totals.refundedUsd).toBe(5100);
      expect(body.totals.lentUsd).toBe(0);
    });

    test("does not make a refunded bidder a lender", async () => {
      // Capital was returned, so no claim exists and no rank was taken.
      const a = await addresses();
      const { body } = await portfolio(a.novum);
      expect(body.role).toBe("new");
    });

    test("matches the refund through the lock's own signer address", async () => {
      // The settlement records an agent id; only the lock knows which wallet sent it.
      const a = await addresses();
      const mine = await portfolio(a.novum);
      const notMine = await portfolio(a.vector);
      expect(mine.body.refunded).toHaveLength(1);
      expect(notMine.body.refunded).toHaveLength(0);
    });
  });

  describe("a borrower", () => {
    test("is recognised from collateral it owns", async () => {
      const col = await registerFacility({ id: "col-mine", obligorAddress: STRANGER as never });
      const { body } = await portfolio(STRANGER);
      expect(body.role).toBe("borrower");
      expect(body.borrowing[0].collateralId).toBe(col.id);
    });

    test("sees the advance the haircut allows", async () => {
      await registerFacility({
        id: "col-mine",
        obligorAddress: STRANGER as never,
        faceValueUsd: 100_000,
        haircutPct: 15,
      });
      const { body } = await portfolio(STRANGER);
      expect(body.borrowing[0].maxAdvanceUsd).toBe(85_000);
    });

    test("floors the advance rather than rounding it up", async () => {
      await registerFacility({
        id: "col-mine",
        obligorAddress: STRANGER as never,
        faceValueUsd: 1001,
        haircutPct: 15,
      });
      // 1001 * 85 / 100 = 850.85
      const { body } = await portfolio(STRANGER);
      expect(body.borrowing[0].maxAdvanceUsd).toBe(850);
    });

    test("reports whether terms have been posted", async () => {
      await registerFacility({ id: "col-mine", obligorAddress: STRANGER as never });
      const { body } = await portfolio(STRANGER);
      expect(body.borrowing[0].termsPosted).toBe(true);
    });

    test("reports terms as unposted when there are none", async () => {
      await registerFacility({
        id: "col-mine",
        obligorAddress: STRANGER as never,
        terms: undefined,
      });
      const { body } = await portfolio(STRANGER);
      expect(body.borrowing[0].termsPosted).toBe(false);
    });

    test("carries the facility status", async () => {
      await registerFacility({
        id: "col-mine",
        obligorAddress: STRANGER as never,
        status: "ENCUMBERED",
      });
      const { body } = await portfolio(STRANGER);
      expect(body.borrowing[0].status).toBe("ENCUMBERED");
    });

    test("reports nothing drawn on a facility with no race", async () => {
      await registerFacility({ id: "col-mine", obligorAddress: STRANGER as never });
      const { body } = await portfolio(STRANGER);
      expect(body.borrowing[0].drawnUsd).toBe(0);
      expect(body.borrowing[0].repaidUsd).toBe(0);
    });

    test("reports what was drawn once a race has drawn it", async () => {
      const seeded = (await import("@/lib/precedence/store/repositories")).updateCollateral;
      await seeded("col-8802", (c) => {
        c.obligorAddress = STRANGER as never;
      });
      const { body } = await portfolio(STRANGER);
      expect(body.borrowing[0].drawnUsd).toBe(7650);
    });

    test("prefers the PROVEN repayment amount over the asserted one", async () => {
      const repos = await import("@/lib/precedence/store/repositories");
      await repos.updateCollateral("col-8802", (c) => {
        c.obligorAddress = STRANGER as never;
      });
      const race = (await repos.getRace("seed-race-8802"))!;
      await repos.saveRace({
        ...race,
        repayment: { ...race.repayment!, totalUsd: 1, provenAmountUsd: 7810 },
      });
      const { body } = await portfolio(STRANGER);
      expect(body.borrowing[0].repaidUsd).toBe(7810);
    });

    test("falls back to the asserted total when nothing was proven", async () => {
      const repos = await import("@/lib/precedence/store/repositories");
      await repos.updateCollateral("col-8802", (c) => {
        c.obligorAddress = STRANGER as never;
      });
      const race = (await repos.getRace("seed-race-8802"))!;
      await repos.saveRace({
        ...race,
        repayment: { ...race.repayment!, provenAmountUsd: undefined, totalUsd: 7810 },
      });
      const { body } = await portfolio(STRANGER);
      expect(body.borrowing[0].repaidUsd).toBe(7810);
    });

    test("counts only the claims still active against the facility", async () => {
      const repos = await import("@/lib/precedence/store/repositories");
      await repos.updateCollateral("col-8802", (c) => {
        c.obligorAddress = STRANGER as never;
      });
      // Both seeded claims are REPAID.
      const repaid = await portfolio(STRANGER);
      expect(repaid.body.borrowing[0].activeClaims).toBe(0);

      const race = (await repos.getRace("seed-race-8802"))!;
      await repos.saveRace({
        ...race,
        claims: race.claims!.map((c, i) => ({ ...c, state: i === 0 ? "ACTIVE" : c.state })),
      });
      const active = await portfolio(STRANGER);
      expect(active.body.borrowing[0].activeClaims).toBe(1);
    });

    test("totals what it has drawn", async () => {
      const repos = await import("@/lib/precedence/store/repositories");
      await repos.updateCollateral("col-8802", (c) => {
        c.obligorAddress = STRANGER as never;
      });
      const { body } = await portfolio(STRANGER);
      expect(body.totals.borrowedUsd).toBe(7650);
    });

    test("counts its facilities", async () => {
      await registerFacility({ id: "col-a", obligorAddress: STRANGER as never });
      await registerFacility({
        id: "col-b",
        symbol: "LIVE-0002",
        docHash: ("0x" + "11".repeat(32)) as never,
        obligorAddress: STRANGER as never,
      });
      const { body } = await portfolio(STRANGER);
      expect(body.counts.borrowing).toBe(2);
    });
  });

  describe("both sides at once, which is the case a role picker gets wrong", () => {
    test("reports role both", async () => {
      const a = await addresses();
      const repos = await import("@/lib/precedence/store/repositories");
      // Meridian holds a senior claim; give it a facility of its own too.
      await repos.updateCollateral("col-8804", (c) => {
        c.obligorAddress = a.meridian as never;
      });
      const { body } = await portfolio(a.meridian);
      expect(body.role).toBe("both");
    });

    test("keeps both books, not one merged list", async () => {
      const a = await addresses();
      const repos = await import("@/lib/precedence/store/repositories");
      await repos.updateCollateral("col-8804", (c) => {
        c.obligorAddress = a.meridian as never;
      });
      const { body } = await portfolio(a.meridian);
      expect(body.lending).toHaveLength(1);
      expect(body.borrowing).toHaveLength(1);
    });

    test("totals both sides independently", async () => {
      const a = await addresses();
      const repos = await import("@/lib/precedence/store/repositories");
      await repos.updateCollateral("col-8804", (c) => {
        c.obligorAddress = a.meridian as never;
      });
      const { body } = await portfolio(a.meridian);
      expect(body.totals.lentUsd).toBe(5100);
      expect(body.totals.borrowedUsd).toBe(0);
    });
  });

  describe("provenance", () => {
    test("labels a portfolio read from fixtures as simulated", async () => {
      const { body } = await portfolio(STRANGER);
      expect(body.live).toEqual({ sepolia: false, creditcoin: false });
    });

    test("labels it live when the adapters are", async () => {
      deps.sepoliaLive = true;
      deps.creditcoinLive = true;
      const { body } = await portfolio(STRANGER);
      expect(body.live).toEqual({ sepolia: true, creditcoin: true });
    });

    test("reports each chain independently", async () => {
      deps.sepoliaLive = true;
      const { body } = await portfolio(STRANGER);
      expect(body.live).toEqual({ sepolia: true, creditcoin: false });
    });
  });

  describe("edge cases", () => {
    test("says so when no collateral is registered at all", async () => {
      const { getDb } = await import("@/lib/precedence/store/json-store");
      getDb().collateral.length = 0;
      const { body } = await portfolio(STRANGER);
      expect(body.unknownCollateral).toBe("no collateral registered");
    });

    test("omits that note when collateral exists", async () => {
      const { body } = await portfolio(STRANGER);
      expect(body.unknownCollateral).toBeUndefined();
    });

    test("survives a race whose settlement has no refunds", async () => {
      const col = await registerFacility({ id: "col-plain" });
      const { liveRaceIn } = await import("../helpers/fixtures");
      await liveRaceIn(col, {
        settlement: settlementRecord({ refundedFinanciers: [] }),
      });
      const { status } = await portfolio(STRANGER);
      expect(status).toBe(200);
    });

    test("survives a race with no claims array", async () => {
      const col = await registerFacility({ id: "col-noclaims" });
      const { liveRaceIn } = await import("../helpers/fixtures");
      await liveRaceIn(col, { claims: undefined });
      const { status } = await portfolio(STRANGER);
      expect(status).toBe(200);
    });

    test("ignores a refund whose lock belongs to another wallet", async () => {
      const a = await addresses();
      const { body } = await portfolio(a.meridian);
      expect(body.refunded).toHaveLength(0);
    });
  });
});
