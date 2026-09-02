/**
 * The deterministic failure branch.
 *
 * Every transition here is a PERMISSIONLESS, timestamp-gated keeper poke (`DECISIONS.md` Q5), not
 * an agent action. If a monitoring agent had to be alive for lenders to be protected, the honest
 * answer to "what happens when it isn't?" would be "capital stays stuck". Instead the unwind is a
 * property of the contract, anyone can trigger it once the gate opens, and whoever does earns a
 * small bounty from the fee pool.
 *
 * This is half the live demo, and the part that shows the protocol has rules rather than a
 * happy path.
 */
import type {
  DefaultRecord,
  FreezeRecord,
  GracePeriodRecord,
  Hex,
  KeeperPoke,
  LiquidationRecord,
  PcrRecord,
  WaterfallResult,
} from "../types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Protocol parameters for the unwind. Mirrors the on-chain constants. */
export const DISTRESS_PARAMS = {
  /** Coverage below this opens the stabilization window. */
  pcrThresholdPct: 110,
  /** How long the obligor has to post a top-up. */
  pcrWindowHours: 48,
  /** Cure window after a missed repayment, before liquidation can start. */
  graceDays: 7,
  /** Dutch auction opens at this multiple of outstanding principal. */
  auctionStartMultiple: 1.15,
  /** …and decays to this multiple. */
  auctionFloorMultiple: 0.55,
  /** Price decay per Creditcoin block (~15s). */
  auctionDecayBpsPerBlock: 12,
  /** Paid from the fee pool to whoever pokes a keeper function. */
  keeperBountyUsd: 25,
} as const;

/** A demo keeper address. In `chain` mode this is the real poking account. */
export const SAMPLE_KEEPER = "0xSAMPLE_KEEPER_0000000000000000000000000000" as Hex;

export function keeperPoke(
  fn: string,
  gatedOn: string,
  opts: { keeper?: Hex; block?: number; creditcoinTxHash?: Hex; bountyUsd?: number } = {},
): KeeperPoke {
  return {
    fn,
    keeper: opts.keeper ?? SAMPLE_KEEPER,
    bountyUsd: opts.bountyUsd ?? DISTRESS_PARAMS.keeperBountyUsd,
    gatedOn,
    pokedAtBlock: opts.block ?? 0,
    creditcoinTxHash: opts.creditcoinTxHash,
    at: new Date().toISOString(),
  };
}

// ───────────────────────────── FROZEN_DRAW ─────────────────────────────

export function buildFreeze(
  collateralId: string,
  reason: FreezeRecord["reason"],
  detail: string,
  frozenDrawUsd: number,
  poke = keeperPoke("pokeFreezeDraw(bytes32)", "block.timestamp >= facility.drawDeadline || pcr < threshold"),
): FreezeRecord {
  return { collateralId, reason, detail, frozenDrawUsd: round2(frozenDrawUsd), poke };
}

// ───────────────────────────── PCR_STABILIZATION ─────────────────────────────

/**
 * Principal Coverage Ratio = haircut-adjusted collateral value / outstanding principal.
 * Below `pcrThresholdPct` the obligor must post additional collateral or the facility unwinds.
 */
export function computePcr(
  faceValueUsd: number,
  haircutPct: number,
  outstandingPrincipalUsd: number,
): number {
  if (outstandingPrincipalUsd <= 0) return Number.POSITIVE_INFINITY;
  const adjusted = faceValueUsd * (1 - haircutPct / 100);
  return round2((adjusted / outstandingPrincipalUsd) * 100);
}

export function buildPcr(
  collateralId: string,
  faceValueUsd: number,
  haircutPct: number,
  outstandingPrincipalUsd: number,
  opts: { topUpPostedUsd?: number } = {},
): PcrRecord {
  const pcrPct = computePcr(faceValueUsd, haircutPct, outstandingPrincipalUsd);
  const thresholdPct = DISTRESS_PARAMS.pcrThresholdPct;
  const requiredValue = outstandingPrincipalUsd * (thresholdPct / 100);
  const adjusted = faceValueUsd * (1 - haircutPct / 100);
  const shortfallUsd = round2(Math.max(0, requiredValue - adjusted));
  const topUpPostedUsd = round2(opts.topUpPostedUsd ?? 0);

  return {
    collateralId,
    pcrPct,
    thresholdPct,
    shortfallUsd,
    topUpRequestedUsd: shortfallUsd,
    topUpPostedUsd,
    windowExpiresAt: new Date(Date.now() + DISTRESS_PARAMS.pcrWindowHours * 3600_000).toISOString(),
    cured: topUpPostedUsd >= shortfallUsd && shortfallUsd > 0,
    poke: keeperPoke(
      "pokePcrStabilization(bytes32)",
      `pcr < ${thresholdPct}% — permissionless, no agent required`,
    ),
  };
}

// ───────────────────────────── GRACE_PERIOD ─────────────────────────────

export function buildGracePeriod(
  collateralId: string,
  cureAmountUsd: number,
  opts: { curedUsd?: number } = {},
): GracePeriodRecord {
  const curedUsd = round2(opts.curedUsd ?? 0);
  const openedAt = new Date();
  return {
    collateralId,
    cureAmountUsd: round2(cureAmountUsd),
    curedUsd,
    cured: curedUsd >= cureAmountUsd && cureAmountUsd > 0,
    openedAt: openedAt.toISOString(),
    expiresAt: new Date(openedAt.getTime() + DISTRESS_PARAMS.graceDays * 86400_000).toISOString(),
    durationDays: DISTRESS_PARAMS.graceDays,
    poke: keeperPoke(
      "pokeGracePeriod(bytes32)",
      `block.timestamp >= facility.maturity && no verified repayment proof`,
    ),
  };
}

// ───────────────────────────── DUTCH_LIQUIDATION ─────────────────────────────

/**
 * Descending-price auction of the collateral NFT.
 *
 * Price decays deterministically per block from `startPrice` toward `floorPrice`, so recovery does
 * not depend on anyone's discretion — and the clearing price is a function of when a bidder decides
 * the asset is worth it.
 */
export function dutchPriceAt(
  startPriceUsd: number,
  floorPriceUsd: number,
  blocksElapsed: number,
  decayBpsPerBlock = DISTRESS_PARAMS.auctionDecayBpsPerBlock,
): number {
  const decayed = startPriceUsd * (1 - (decayBpsPerBlock / 10000) * blocksElapsed);
  return round2(Math.max(floorPriceUsd, decayed));
}

export function buildLiquidation(
  collateralId: string,
  outstandingPrincipalUsd: number,
  opts: { blocksElapsed?: number; winner?: string } = {},
): LiquidationRecord {
  const startPriceUsd = round2(outstandingPrincipalUsd * DISTRESS_PARAMS.auctionStartMultiple);
  const floorPriceUsd = round2(outstandingPrincipalUsd * DISTRESS_PARAMS.auctionFloorMultiple);
  const blocksElapsed = opts.blocksElapsed ?? 0;

  const cleared = opts.winner !== undefined;
  const clearingPriceUsd = cleared
    ? dutchPriceAt(startPriceUsd, floorPriceUsd, blocksElapsed)
    : undefined;

  return {
    collateralId,
    startPriceUsd,
    floorPriceUsd,
    decayBpsPerBlock: DISTRESS_PARAMS.auctionDecayBpsPerBlock,
    clearingPriceUsd,
    winner: opts.winner,
    proceedsUsd: clearingPriceUsd,
    startedAt: new Date().toISOString(),
    clearedAt: cleared ? new Date().toISOString() : undefined,
    poke: keeperPoke(
      "pokeDutchLiquidation(bytes32)",
      `block.timestamp >= gracePeriod.expiresAt && !gracePeriod.cured`,
    ),
  };
}

// ───────────────────────────── TERMINATED_DEFAULT ─────────────────────────────

/**
 * Allocate the liquidation outcome across tranches from an already-computed waterfall.
 *
 * The point to make on screen: first loss lands on SUBORDINATE, then JUNIOR. Senior is protected by
 * subordination exactly as its 5.2% coupon implied. That is the whole reason priority is worth
 * paying for — and it only holds because the waterfall is strict.
 */
export function buildDefault(
  collateralId: string,
  obligor: string,
  waterfall: WaterfallResult,
): DefaultRecord {
  const byTranche = (t: string, k: "lossAbsorbedUsd" | "principalReturnedUsd") =>
    round2(waterfall.lines.filter((l) => l.tranche === t).reduce((s, l) => s + l[k], 0));

  return {
    collateralId,
    obligor,
    proceedsUsd: waterfall.realizedRepaymentUsd,
    seniorRecoveredUsd: byTranche("SENIOR", "principalReturnedUsd"),
    seniorLossUsd: byTranche("SENIOR", "lossAbsorbedUsd"),
    juniorLossUsd: byTranche("JUNIOR", "lossAbsorbedUsd"),
    subordinateLossUsd: byTranche("SUBORDINATE", "lossAbsorbedUsd"),
    obligorCreditFlag: "DEFAULT",
    poke: keeperPoke(
      "pokeTerminateDefault(bytes32)",
      "liquidation.clearedAt != 0 — distributes proceeds and flags the obligor",
    ),
  };
}
