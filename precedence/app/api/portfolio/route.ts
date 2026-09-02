import { getDeps } from "@/lib/precedence/config";
import { listCollateral, listRaces, getRace } from "@/lib/precedence/store/repositories";
import type { PriorityRace, Tranche } from "@/lib/precedence/types";

/**
 * GET /api/portfolio?address=0x… — everything one wallet holds, on both sides of the book.
 *
 * @remarks Role is DERIVED, never declared. There is no signup, no role picker and no account
 * record: an address that holds a claim is a lender, an address that owns registered collateral is
 * a borrower, and most real participants are eventually both. Asking someone to choose at signup
 * would immediately be wrong for the interesting case — a borrower who also lends against someone
 * else's receipt — and would put a mutable profile field in front of on-chain facts.
 *
 * A wallet with no history is not an error state. It gets `role: "new"`, which the UI uses to
 * offer the two things such a visitor can actually do.
 */

type Role = "new" | "lender" | "borrower" | "both";

interface LendingPosition {
  collateralId: string;
  title: string;
  tranche: Tranche;
  priorityRank: 1 | 2 | 3;
  principalUsd: number;
  ratePct: number;
  tokenId: string;
  /** The proven position that won this rank — the whole point of the protocol. */
  provenAt: { blockNumber: number; txIndex: number; seq: number };
  state: string;
  raceId: string;
  raceStatus: string;
}

interface RefundedBid {
  collateralId: string;
  title: string;
  tranche: Tranche;
  amountUsd: number;
  reason: string;
}

interface BorrowingPosition {
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
}

const eq = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) {
    return Response.json({ ok: false, error: "address query parameter is required" }, { status: 400 });
  }

  const [collateral, raceSummaries] = await Promise.all([listCollateral(), listRaces()]);
  const races: PriorityRace[] = [];
  for (const s of raceSummaries) {
    const full = await getRace(s.id);
    if (full) races.push(full);
  }

  const lending: LendingPosition[] = [];
  const refunded: RefundedBid[] = [];
  const byId = new Map(collateral.map((c) => [c.id, c]));

  for (const race of races) {
    const title = race.collateral.title;

    for (const claim of race.claims ?? []) {
      if (!eq(claim.holderAddress, address)) continue;
      lending.push({
        collateralId: claim.collateralId,
        title,
        tranche: claim.tranche,
        priorityRank: claim.priorityRank,
        principalUsd: claim.principalUsd,
        ratePct: claim.ratePct,
        tokenId: claim.tokenId,
        provenAt: claim.provenAt,
        state: claim.state,
        raceId: race.id,
        raceStatus: race.status,
      });
    }

    // A refunded bid is a real outcome worth showing: capital was returned rather than
    // silently demoted into risk the financier never agreed to hold.
    for (const r of race.settlement?.refundedFinanciers ?? []) {
      const lock = race.locks.find((l) => l.financier === r.agentId);
      if (!eq(lock?.financierAddress, address)) continue;
      refunded.push({
        collateralId: race.collateral.id,
        title,
        tranche: r.tranche,
        amountUsd: r.amountUsd,
        reason: r.reason,
      });
    }
  }

  const borrowing: BorrowingPosition[] = [];
  for (const c of collateral) {
    if (!eq(c.obligorAddress, address)) continue;
    const race = races.find((r) => r.collateral.id === c.id);
    borrowing.push({
      collateralId: c.id,
      title: c.title,
      assetType: c.assetType,
      faceValueUsd: c.faceValueUsd,
      maxAdvanceUsd: Math.floor((c.faceValueUsd * (100 - c.haircutPct)) / 100),
      status: c.status,
      termsPosted: Boolean(c.terms),
      drawnUsd: race?.draw?.amountUsd ?? 0,
      // Prefer the amount DECODED from the verified transaction over what was asserted.
      repaidUsd: race?.repayment?.provenAmountUsd ?? race?.repayment?.totalUsd ?? 0,
      activeClaims: (race?.claims ?? []).filter((k) => k.state === "ACTIVE").length,
      raceId: race?.id,
      raceStatus: race?.status,
    });
  }

  const role: Role =
    lending.length && borrowing.length
      ? "both"
      : lending.length
        ? "lender"
        : borrowing.length
          ? "borrower"
          : "new";

  const d = getDeps();

  return Response.json({
    ok: true,
    address,
    role,
    // Whether these positions are read from chain or from fixtures. The UI must label this;
    // a portfolio is exactly where a visitor would otherwise assume "on-chain".
    live: { sepolia: d.sepolia.isLive(), creditcoin: d.creditcoin.isLive() },
    lending,
    refunded,
    borrowing,
    totals: {
      lentUsd: lending.reduce((n, l) => n + l.principalUsd, 0),
      refundedUsd: refunded.reduce((n, r) => n + r.amountUsd, 0),
      borrowedUsd: borrowing.reduce((n, b) => n + b.drawnUsd, 0),
      // Weighted average coupon across active claims — what this wallet actually earns.
      blendedRatePct: (() => {
        const active = lending.filter((l) => l.state === "ACTIVE");
        const principal = active.reduce((n, l) => n + l.principalUsd, 0);
        if (principal === 0) return 0;
        return active.reduce((n, l) => n + l.principalUsd * l.ratePct, 0) / principal;
      })(),
    },
    counts: { lending: lending.length, borrowing: borrowing.length, refunded: refunded.length },
    unknownCollateral: [...byId.keys()].length === 0 ? "no collateral registered" : undefined,
  });
}
