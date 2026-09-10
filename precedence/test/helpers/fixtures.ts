/**
 * Store fixtures.
 *
 * @remarks The seeded fixtures are deliberately unusable for the live path: every one of them
 * carries a `0xSAMPLE_DOC_HASH_…` placeholder, and `live-race.ts` refuses a document hash that is
 * not 32 real bytes. That refusal is correct and is itself tested, so a test of the *happy* path
 * needs collateral with a genuine hash — which is what `registerFacility()` is for.
 */
import { addCollateral, resetStore, saveRace } from "@/lib/precedence/store/repositories";
import { seedCollateral } from "@/lib/precedence/store/seed";
import { analyzeCollateral } from "@precedence/sdk/domain/collateral";
import type {
  CollateralAsset,
  Hex,
  PriorityRace,
  SourceLockRecord,
  Tranche,
} from "@precedence/sdk/types";
import {
  FAKE_LENDER,
  FAKE_OBLIGOR,
  FAKE_TOKEN,
  FAKE_VAULT,
  REAL_DOC_HASH,
  txHash,
} from "./fakes";

/** A clean seeded store, and adapters rebuilt so vault lock counters do not carry over. */
export async function freshStore(): Promise<void> {
  await resetStore();
}

/**
 * Collateral with a real 32-byte document hash, registered into the store.
 *
 * @remarks Modelled on a seeded asset rather than written out field by field, so a new required
 * field on `CollateralAsset` breaks the compile here once instead of in twenty test files.
 */
export async function registerFacility(
  over: Partial<CollateralAsset> = {},
): Promise<CollateralAsset> {
  const base = seedCollateral()[0];
  const asset: CollateralAsset = {
    ...base,
    id: "col-live",
    symbol: "LIVE-0001",
    docHash: REAL_DOC_HASH,
    obligorAddress: FAKE_OBLIGOR,
    vaultAddress: FAKE_VAULT,
    status: "CLEAR",
    ...over,
  };
  await addCollateral(asset);
  return asset;
}

export function lockRecord(over: Partial<SourceLockRecord> = {}): SourceLockRecord {
  return {
    collateralId: "col-live",
    financier: FAKE_LENDER,
    financierAddress: FAKE_LENDER,
    tranche: "SENIOR" as Tranche,
    amountUsd: 60_000,
    lockBlockNumber: 9_000_010,
    lockTxIndex: 71,
    seq: 1,
    token: FAKE_TOKEN,
    sepoliaTxHash: txHash(2),
    receiptStatus: 1,
    emittedBy: FAKE_VAULT,
    timestamp: "2026-09-01T00:00:00.000Z",
    refunded: false,
    ...over,
  };
}

/**
 * A race that exists on chain, written straight into the store.
 *
 * @remarks `simulated: false` and an `onchain` block are what separate a live settlement from a
 * scripted one, and several routes branch on exactly that — `advance` refuses one, `status`
 * requires one, `prove` requires one. Built here rather than by driving `openLiveRace`, so a test
 * can put a race in a state the happy path would take eight minutes to reach.
 */
export async function liveRaceIn(
  collateral: CollateralAsset,
  over: Partial<PriorityRace> = {},
  onchainOver: Partial<NonNullable<PriorityRace["onchain"]>> = {},
): Promise<PriorityRace> {
  const now = "2026-09-01T00:00:00.000Z";
  const race: PriorityRace = {
    id: `live-${collateral.docHash.slice(2, 10)}-1`,
    simulated: false,
    onchain: {
      chainId: 11155111,
      vaultAddress: FAKE_VAULT,
      collateralId: collateral.docHash as Hex,
      obligor: FAKE_OBLIGOR,
      openTxHash: txHash(1),
      openBlockNumber: 9_000_000,
      raceNonce: 1,
      raceDeadline: Math.floor(Date.now() / 1000) + 3600,
      facilitySizeUsd: 100_000,
      ...onchainOver,
    },
    status: "RACE_OPEN",
    track: "PERFORMING",
    scenario: "performing",
    obligor: collateral.obligor,
    collateral,
    analysis: analyzeCollateral(collateral, 100_000),
    requestedTotalUsd: 100_000,
    decisions: [],
    bids: [],
    locks: [],
    proverCalls: [],
    claims: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
  await saveRace(race);
  return race;
}

/** A scripted race: `simulated: true` and no `onchain` block at all. */
export async function scriptedRaceIn(
  collateral: CollateralAsset,
  over: Partial<PriorityRace> = {},
): Promise<PriorityRace> {
  const race = await liveRaceIn(collateral, {
    id: "scripted-1",
    simulated: true,
    ...over,
  });
  // Written after `liveRaceIn` so the shape stays in one place, then stripped: a scripted race's
  // defining property is that it has nothing on chain to point at.
  const scripted: PriorityRace = { ...race, onchain: undefined };
  await saveRace(scripted);
  return scripted;
}

/** The settlement block a proven race carries, as `applyProvenSettlement` would have written it. */
export function settlementRecord(over: Partial<NonNullable<PriorityRace["settlement"]>> = {}) {
  return {
    collateralId: "col-live",
    seniorFinancier: FAKE_LENDER,
    seniorAmountUsd: 60_000,
    juniorFinancier: "",
    juniorAmountUsd: 0,
    refundedFinanciers: [],
    provenOrder: [{ agentId: FAKE_LENDER, blockNumber: 9_000_010, txIndex: 71, seq: 1 }],
    settlementBlock: 4_100_000,
    creditcoinTxHash: txHash(9),
    settledAt: "2026-09-01T00:00:00.000Z",
    ...over,
  } as NonNullable<PriorityRace["settlement"]>;
}
