/**
 * The strict-seniority waterfall.
 *
 * @remarks The claim being protected here is the reason a senior lender accepts a lower coupon:
 * rank 1 is satisfied completely before rank 2 sees a cent, so first loss lands on the most
 * subordinate holder. `assertSeniorityRespected` exists because that claim is cheap to check and
 * catastrophic to get wrong — if any tranche is paid while a more senior one is short, the
 * protocol's central promise is false.
 */
import { describe, expect, test } from "bun:test";
import {
  assertSeniorityRespected,
  computeWaterfall,
  lossByTranche,
} from "../src/domain/waterfall";
import { claim, threeClaims } from "./helpers";

const FEES = { protocolFeeBps: 25, proverFeeBps: 5 };

/** Principal 8,500 across the three tranches; a 90-day term at 5 / 10 / 18 per cent. */
const FULL_DUE = 8_500;

describe("computeWaterfall", () => {
  describe("fees", () => {
    test("takes the protocol fee off the top", () => {
      const r = computeWaterfall(threeClaims(), 10_000, FEES);
      expect(r.protocolFeeUsd).toBe(25);
    });

    test("takes the prover fee off the top", () => {
      const r = computeWaterfall(threeClaims(), 10_000, FEES);
      expect(r.proverFeeUsd).toBe(5);
    });

    test("distributes what is left after both", () => {
      const r = computeWaterfall(threeClaims(), 10_000, FEES);
      expect(r.distributableUsd).toBe(10_000 - 25 - 5);
    });

    test("never distributes a negative amount", () => {
      const r = computeWaterfall(threeClaims(), 0, { protocolFeeBps: 5_000, proverFeeBps: 5_000 });
      expect(r.distributableUsd).toBe(0);
    });

    test("reports the realised repayment it worked from", () => {
      const r = computeWaterfall(threeClaims(), 7_810, FEES);
      expect(r.realizedRepaymentUsd).toBe(7_810);
    });
  });

  describe("a performing payoff", () => {
    test("pays every tranche in full when there is enough", () => {
      const r = computeWaterfall(threeClaims(), 10_000, FEES);
      for (const l of r.lines) expect(l.satisfiedInFull).toBe(true);
    });

    test("accrues interest on principal over the term", () => {
      const r = computeWaterfall([claim({ principalUsd: 1_000, ratePct: 10 })], 10_000, {
        ...FEES,
        termDays: 365,
      });
      expect(r.lines[0].interestDueUsd).toBe(100);
    });

    test("defaults to a ninety-day accrual", () => {
      const r = computeWaterfall([claim({ principalUsd: 1_000, ratePct: 10 })], 10_000, FEES);
      // 1000 * 0.10 * 90/365
      expect(r.lines[0].interestDueUsd).toBeCloseTo(24.66, 2);
    });

    test("returns principal before it pays interest", () => {
      const r = computeWaterfall([claim({ principalUsd: 1_000, ratePct: 10 })], 1_000, FEES);
      expect(r.lines[0].principalReturnedUsd).toBe(1_000 - 1_000 * 0.003);
    });

    test("reports interest actually earned separately from interest due", () => {
      const r = computeWaterfall([claim({ principalUsd: 1_000, ratePct: 10 })], 1_002, FEES);
      expect(r.lines[0].interestDueUsd).toBeGreaterThan(r.lines[0].interestEarnedUsd);
    });

    test("leaves the surplus unallocated rather than handing it to a lender", () => {
      const r = computeWaterfall(threeClaims(), 20_000, FEES);
      expect(r.unallocatedUsd).toBeGreaterThan(0);
    });

    test("labels itself a repayment", () => {
      const r = computeWaterfall(threeClaims(), 10_000, FEES);
      expect(r.kind).toBe("REPAYMENT");
    });
  });

  describe("a shortfall", () => {
    test("pays senior in full first", () => {
      const r = computeWaterfall(threeClaims(), 6_000, FEES);
      const senior = r.lines.find((l) => l.tranche === "SENIOR")!;
      expect(senior.satisfiedInFull).toBe(true);
    });

    test("leaves the most subordinate holder short", () => {
      const r = computeWaterfall(threeClaims(), 6_000, FEES);
      const sub = r.lines.find((l) => l.tranche === "SUBORDINATE")!;
      expect(sub.satisfiedInFull).toBe(false);
    });

    test("lands first loss on the most subordinate tranche", () => {
      const losses = lossByTranche(computeWaterfall(threeClaims(), 8_000, FEES));
      expect(losses.SUBORDINATE).toBeGreaterThan(0);
      expect(losses.SENIOR).toBe(0);
    });

    test("does not touch junior until subordinate is wiped out", () => {
      // Enough for senior and junior principal, not for subordinate.
      const r = computeWaterfall(threeClaims(), 8_100, FEES);
      const losses = lossByTranche(r);
      expect(losses.JUNIOR).toBe(0);
      expect(losses.SUBORDINATE).toBeGreaterThan(0);
    });

    test("wipes out subordinate entirely before junior takes any loss", () => {
      const r = computeWaterfall(threeClaims(), 5_200, FEES);
      const losses = lossByTranche(r);
      expect(losses.SUBORDINATE).toBe(850);
      expect(losses.JUNIOR).toBeGreaterThan(0);
    });

    test("pays nobody when nothing came back", () => {
      const r = computeWaterfall(threeClaims(), 0, FEES);
      for (const l of r.lines) expect(l.payoutUsd).toBe(0);
    });

    test("allocates the whole loss when nothing came back", () => {
      const losses = lossByTranche(computeWaterfall(threeClaims(), 0, FEES));
      expect(losses.SENIOR + losses.JUNIOR + losses.SUBORDINATE).toBe(FULL_DUE);
    });

    test("respects seniority on every shortfall size", () => {
      for (const repaid of [0, 500, 2_000, 5_000, 5_100, 7_650, 8_000, 8_500, 9_000]) {
        const r = computeWaterfall(threeClaims(), repaid, FEES);
        expect(assertSeniorityRespected(r).ok).toBe(true);
      }
    });
  });

  describe("a liquidation", () => {
    test("recovers principal and pays no interest", () => {
      const r = computeWaterfall(threeClaims(), 10_000, { ...FEES, kind: "LIQUIDATION" });
      for (const l of r.lines) expect(l.interestDueUsd).toBe(0);
    });

    test("labels itself a liquidation", () => {
      const r = computeWaterfall(threeClaims(), 10_000, { ...FEES, kind: "LIQUIDATION" });
      expect(r.kind).toBe("LIQUIDATION");
    });

    test("still respects seniority", () => {
      const r = computeWaterfall(threeClaims(), 4_000, { ...FEES, kind: "LIQUIDATION" });
      expect(assertSeniorityRespected(r).ok).toBe(true);
    });

    test("lands liquidation loss on the subordinate holder first", () => {
      const losses = lossByTranche(
        computeWaterfall(threeClaims(), 6_000, { ...FEES, kind: "LIQUIDATION" }),
      );
      expect(losses.SENIOR).toBe(0);
      expect(losses.SUBORDINATE).toBeGreaterThan(0);
    });
  });

  describe("ordering", () => {
    test("sorts by rank rather than trusting the input order", () => {
      const r = computeWaterfall([...threeClaims()].reverse(), 6_000, FEES);
      expect(r.lines.map((l) => l.priorityRank)).toEqual([1, 2, 3]);
    });

    test("settles identically whatever order the claims arrive in", () => {
      const forward = computeWaterfall(threeClaims(), 6_000, FEES);
      const reverse = computeWaterfall([...threeClaims()].reverse(), 6_000, FEES);
      expect(reverse.lines).toEqual(forward.lines);
    });

    test("handles a facility with no claims", () => {
      const r = computeWaterfall([], 1_000, FEES);
      expect(r.lines).toEqual([]);
      expect(r.unallocatedUsd).toBe(r.distributableUsd);
    });
  });
});

describe("assertSeniorityRespected", () => {
  test("passes a waterfall computed by this module", () => {
    expect(assertSeniorityRespected(computeWaterfall(threeClaims(), 6_000, FEES)).ok).toBe(true);
  });

  test("catches a junior payout made while senior was short", () => {
    // Hand-built violation: exactly the state that would make the protocol's claim false.
    const bad = computeWaterfall(threeClaims(), 6_000, FEES);
    bad.lines[0] = { ...bad.lines[0], satisfiedInFull: false, lossAbsorbedUsd: 100 };
    bad.lines[1] = { ...bad.lines[1], payoutUsd: 500 };
    const r = assertSeniorityRespected(bad);
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
  });

  test("names both tranches and the amounts in the violation", () => {
    const bad = computeWaterfall(threeClaims(), 6_000, FEES);
    bad.lines[0] = { ...bad.lines[0], satisfiedInFull: false, lossAbsorbedUsd: 100 };
    bad.lines[1] = { ...bad.lines[1], payoutUsd: 500 };
    const [violation] = assertSeniorityRespected(bad).violations;
    expect(violation).toContain("JUNIOR");
    expect(violation).toContain("SENIOR");
    expect(violation).toContain("rank 1");
  });

  test("allows a zero payout to a junior tranche while senior is short", () => {
    const r = computeWaterfall(threeClaims(), 2_000, FEES);
    expect(assertSeniorityRespected(r).ok).toBe(true);
  });

  test("passes an empty waterfall", () => {
    expect(assertSeniorityRespected(computeWaterfall([], 0, FEES)).ok).toBe(true);
  });
});

describe("lossByTranche", () => {
  test("reports zero loss on a full payoff", () => {
    const losses = lossByTranche(computeWaterfall(threeClaims(), 10_000, FEES));
    expect(Object.values(losses).every((v) => v === 0)).toBe(true);
  });

  test("aggregates two claims in the same tranche", () => {
    const claims = [
      claim({ claimId: "a", tranche: "JUNIOR", priorityRank: 2, principalUsd: 1_000, holder: "x" }),
      claim({ claimId: "b", tranche: "JUNIOR", priorityRank: 2, principalUsd: 1_000, holder: "y" }),
    ];
    const losses = lossByTranche(computeWaterfall(claims, 0, FEES));
    expect(losses.JUNIOR).toBe(2_000);
  });

  test("totals to the whole principal when nothing is repaid", () => {
    const losses = lossByTranche(computeWaterfall(threeClaims(), 0, FEES));
    expect(Object.values(losses).reduce((a, b) => a + b, 0)).toBe(FULL_DUE);
  });
});
