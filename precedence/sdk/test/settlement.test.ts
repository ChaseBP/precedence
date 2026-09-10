/**
 * `settlePriorityLocks` — turning proven positions into ranks, claims and refunds.
 *
 * @remarks The rule under test that people find surprising is the refund. A financier who bid
 * SENIOR and was outpaced is paid back in full rather than quietly demoted into junior risk: they
 * priced senior protection and never consented to anything else. Demotion exists, but it is
 * opt-in per financier, which is the only version of it that is honest.
 *
 * The seeded example is the same-block race, because that is where the design earns its keep —
 * two senior bids in one block, separated only by transaction index.
 */
import { describe, expect, test } from "bun:test";
import { settlePriorityLocks } from "../src/domain/lock";
import { lock, sameBlockRace, tx } from "./helpers";

/** Facility sizing for a $10,000 receipt at a 15% haircut: 5,100 / 2,550 / 850. */
const SIZING = { seniorUsd: 5_100, juniorUsd: 2_550, subordinateUsd: 850 };
const RATES = { SENIOR: 5, JUNIOR: 10, SUBORDINATE: 18 } as const;

describe("settlePriorityLocks", () => {
  describe("the same-block race", () => {
    test("awards senior to the earliest index, not the earliest click", () => {
      const { settlement } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(settlement.seniorFinancier).toBe("meridian");
    });

    test("gives senior its full requested amount", () => {
      const { settlement } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(settlement.seniorAmountUsd).toBe(5_100);
    });

    test("awards the uncontested junior tranche", () => {
      const { settlement } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(settlement.juniorFinancier).toBe("vector");
      expect(settlement.juniorAmountUsd).toBe(2_550);
    });

    test("settles the same way whatever order the locks arrive in", () => {
      const forward = settlePriorityLocks("col-1", sameBlockRace(), SIZING).settlement;
      const reverse = settlePriorityLocks("col-1", sameBlockRace().reverse(), SIZING).settlement;
      expect(reverse.seniorFinancier).toBe(forward.seniorFinancier);
      expect(reverse.provenOrder).toEqual(forward.provenOrder);
    });

    test("records the proven order it settled from", () => {
      const { settlement } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(settlement.provenOrder.map((p) => p.txIndex)).toEqual([17, 22, 41]);
    });

    test("carries the block and index of every position", () => {
      const { settlement } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      for (const p of settlement.provenOrder) {
        expect(p.blockNumber).toBe(6_182_101);
        expect(typeof p.txIndex).toBe("number");
      }
    });
  });

  describe("the outpaced senior bid", () => {
    test("is refunded rather than seated somewhere else", () => {
      const { refunds } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(refunds.map((r) => r.agentId)).toEqual(["novum"]);
    });

    test("is refunded in full", () => {
      const { refunds } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(refunds[0].amountUsd).toBe(5_100);
    });

    test("keeps the tranche it actually bid, not the one it might have taken", () => {
      const { refunds } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(refunds[0].tranche).toBe("SENIOR");
    });

    test("names who outpaced it and at what position", () => {
      const { refunds } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(refunds[0].reason).toContain("MERIDIAN");
      expect(refunds[0].reason).toContain("txIndex 17");
    });

    test("says the capital was returned and not demoted", () => {
      const { refunds } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(refunds[0].reason).toContain("not demoted");
    });

    test("holds no claim, so it took no rank", () => {
      const { claims } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(claims.map((c) => c.holder)).not.toContain("novum");
    });

    test("does not appear as the subordinate award", () => {
      const { settlement } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(settlement.subordinateFinancier).toBeUndefined();
    });
  });

  describe("demotion, which is opt-in only", () => {
    test("seats an outpaced bid lower when its financier consented", () => {
      const { claims } = settlePriorityLocks("col-1", sameBlockRace(), SIZING, {
        allowDemotion: { novum: true },
      });
      const novum = claims.filter((c) => c.holder === "novum");
      expect(novum.length).toBeGreaterThan(0);
      expect(novum[0].tranche).toBe("SUBORDINATE");
    });

    test("only fills what capacity remains beneath", () => {
      const { claims } = settlePriorityLocks("col-1", sameBlockRace(), SIZING, {
        allowDemotion: { novum: true },
      });
      const seated = claims.filter((c) => c.holder === "novum").reduce((n, c) => n + c.principalUsd, 0);
      expect(seated).toBe(850);
    });

    test("refunds the remainder that fits nowhere", () => {
      const { refunds } = settlePriorityLocks("col-1", sameBlockRace(), SIZING, {
        allowDemotion: { novum: true },
      });
      expect(refunds[0].agentId).toBe("novum");
      expect(refunds[0].amountUsd).toBe(5_100 - 850);
    });

    test("says the facility was fully allocated rather than blaming a rival", () => {
      const { refunds } = settlePriorityLocks("col-1", sameBlockRace(), SIZING, {
        allowDemotion: { novum: true },
      });
      expect(refunds[0].reason).toContain("fully allocated");
    });

    test("one financier's consent does not demote another's capital", () => {
      const locks = [
        lock({ financier: "meridian", tranche: "SENIOR", amountUsd: 5_100, lockTxIndex: 1, seq: 1 }),
        lock({ financier: "vector", tranche: "SENIOR", amountUsd: 5_100, lockTxIndex: 2, seq: 2, sepoliaTxHash: tx(2) }),
        lock({ financier: "novum", tranche: "SENIOR", amountUsd: 5_100, lockTxIndex: 3, seq: 3, sepoliaTxHash: tx(3) }),
      ];
      const { claims } = settlePriorityLocks("col-1", locks, SIZING, {
        allowDemotion: { novum: true },
      });
      expect(claims.some((c) => c.holder === "vector")).toBe(false);
      expect(claims.some((c) => c.holder === "novum")).toBe(true);
    });
  });

  describe("the claims it mints", () => {
    test("gives senior priority rank one", () => {
      const { claims } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(claims.find((c) => c.tranche === "SENIOR")?.priorityRank).toBe(1);
    });

    test("gives junior rank two", () => {
      const { claims } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(claims.find((c) => c.tranche === "JUNIOR")?.priorityRank).toBe(2);
    });

    test("records the proven position that won each rank", () => {
      const { claims } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(claims.find((c) => c.tranche === "SENIOR")?.provenAt).toEqual({
        blockNumber: 6_182_101,
        txIndex: 17,
        seq: 1,
      });
    });

    test("prices each claim from the borrower's posted terms", () => {
      const { claims } = settlePriorityLocks("col-1", sameBlockRace(), SIZING, { rates: RATES });
      expect(claims.find((c) => c.tranche === "SENIOR")?.ratePct).toBe(5);
      expect(claims.find((c) => c.tranche === "JUNIOR")?.ratePct).toBe(10);
    });

    test("prices ordinally — senior never pays more than junior", () => {
      const { claims } = settlePriorityLocks("col-1", sameBlockRace(), SIZING, { rates: RATES });
      const senior = claims.find((c) => c.tranche === "SENIOR")!;
      const junior = claims.find((c) => c.tranche === "JUNIOR")!;
      expect(senior.ratePct).toBeLessThan(junior.ratePct);
    });

    test("starts every claim ACTIVE", () => {
      const { claims } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      for (const c of claims) expect(c.state).toBe("ACTIVE");
    });

    test("carries the holder's wallet, not only an agent id", () => {
      const { claims } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      for (const c of claims) expect(c.holderAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    test("ties every claim to the collateral it settled", () => {
      const { claims } = settlePriorityLocks("col-xyz", sameBlockRace(), SIZING);
      for (const c of claims) expect(c.collateralId).toBe("col-xyz");
    });
  });

  describe("capacity", () => {
    test("caps an oversized lock at the tranche's capacity", () => {
      const locks = [lock({ amountUsd: 99_999 })];
      const { claims, refunds } = settlePriorityLocks("col-1", locks, SIZING);
      expect(claims[0].principalUsd).toBe(5_100);
      expect(refunds[0].amountUsd).toBe(99_999 - 5_100);
    });

    test("never awards more than the facility was sized for", () => {
      const { settlement } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      const total =
        settlement.seniorAmountUsd +
        settlement.juniorAmountUsd +
        (settlement.subordinateAmountUsd ?? 0);
      expect(total).toBeLessThanOrEqual(SIZING.seniorUsd + SIZING.juniorUsd + SIZING.subordinateUsd);
    });

    test("refunds everything when a tranche has no capacity at all", () => {
      const { claims, refunds } = settlePriorityLocks("col-1", [lock()], {
        seniorUsd: 0,
        juniorUsd: 0,
        subordinateUsd: 0,
      });
      expect(claims).toEqual([]);
      expect(refunds[0].amountUsd).toBe(5_100);
    });

    test("settles an empty race without inventing anything", () => {
      const { settlement, claims, refunds } = settlePriorityLocks("col-1", [], SIZING);
      expect(claims).toEqual([]);
      expect(refunds).toEqual([]);
      expect(settlement.seniorFinancier).toBe("");
      expect(settlement.seniorAmountUsd).toBe(0);
    });

    test("conserves capital: every dollar locked is either seated or refunded", () => {
      const locked = sameBlockRace().reduce((n, l) => n + l.amountUsd, 0);
      const { claims, refunds } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      const seated = claims.reduce((n, c) => n + c.principalUsd, 0);
      const returned = refunds.reduce((n, r) => n + r.amountUsd, 0);
      expect(seated + returned).toBe(locked);
    });

    test("conserves capital under demotion too", () => {
      const locked = sameBlockRace().reduce((n, l) => n + l.amountUsd, 0);
      const { claims, refunds } = settlePriorityLocks("col-1", sameBlockRace(), SIZING, {
        allowDemotion: { novum: true },
      });
      const seated = claims.reduce((n, c) => n + c.principalUsd, 0);
      const returned = refunds.reduce((n, r) => n + r.amountUsd, 0);
      expect(seated + returned).toBe(locked);
    });
  });

  describe("the settlement record", () => {
    test("carries the settlement block when one is given", () => {
      const { settlement } = settlePriorityLocks("col-1", sameBlockRace(), SIZING, {
        settlementBlock: 5_412_203,
      });
      expect(settlement.settlementBlock).toBe(5_412_203);
    });

    test("does not invent a Creditcoin transaction hash", () => {
      const { settlement } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(settlement.creditcoinTxHash).toBe("0x");
    });

    test("records the hash when the proof actually landed", () => {
      const hash = tx(9);
      const { settlement } = settlePriorityLocks("col-1", sameBlockRace(), SIZING, {
        creditcoinTxHash: hash,
      });
      expect(settlement.creditcoinTxHash).toBe(hash);
    });

    test("lists every refund on the settlement, not only in the return value", () => {
      const { settlement, refunds } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      expect(settlement.refundedFinanciers).toEqual(refunds);
    });

    test("no financier holds two ranks in the same tranche", () => {
      const { claims } = settlePriorityLocks("col-1", sameBlockRace(), SIZING);
      const seen = new Set<string>();
      for (const c of claims) {
        const key = `${c.tranche}:${c.holder}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });
  });
});
