/**
 * Builders for the SDK's own tests.
 *
 * @remarks Every one of these functions is pure, so the tests need no doubles, no clock control
 * and no network — only well-shaped inputs. Defaults are chosen so a test can change exactly the
 * one field it is about.
 */
import type {
  CollateralAsset,
  DocumentExtraction,
  Hex,
  PriorityClaim,
  SourceLockRecord,
  Tranche,
} from "../src/types";

export const VAULT = ("0x" + "11".repeat(20)) as Hex;
export const TOKEN = ("0x" + "22".repeat(20)) as Hex;
export const WALLET = ("0x" + "33".repeat(20)) as Hex;

export const tx = (n: number): Hex =>
  ("0x" + n.toString(16).padStart(2, "0").repeat(32).slice(0, 64)) as Hex;

/**
 * One verified lock.
 *
 * @remarks `receiptStatus: 1` by default and `emittedBy: VAULT`, because those are the two things
 * the precompile does NOT check and the dApp must — a test that wants to exercise the refusal has
 * to say so explicitly.
 */
export function lock(over: Partial<SourceLockRecord> = {}): SourceLockRecord {
  return {
    collateralId: "col-1",
    financier: "meridian",
    financierAddress: WALLET,
    tranche: "SENIOR" as Tranche,
    amountUsd: 5_100,
    lockBlockNumber: 6_182_101,
    lockTxIndex: 17,
    seq: 1,
    token: TOKEN,
    sepoliaTxHash: tx(1),
    receiptStatus: 1,
    emittedBy: VAULT,
    timestamp: "2026-09-01T08:18:00.000Z",
    refunded: false,
    ...over,
  };
}

/**
 * The three-lock, one-block set the whole protocol exists for.
 *
 * @remarks All three land in block 6,182,101, so height alone cannot order them. Meridian at
 * index 17 takes senior; Vector at 22 is uncontested junior; Novum ALSO bid senior and is outpaced
 * at index 41.
 */
export function sameBlockRace(): SourceLockRecord[] {
  return [
    lock({ financier: "meridian", tranche: "SENIOR", amountUsd: 5_100, lockTxIndex: 17, seq: 1, sepoliaTxHash: tx(1) }),
    lock({ financier: "vector", tranche: "JUNIOR", amountUsd: 2_550, lockTxIndex: 22, seq: 2, sepoliaTxHash: tx(2) }),
    lock({ financier: "novum", tranche: "SENIOR", amountUsd: 5_100, lockTxIndex: 41, seq: 3, sepoliaTxHash: tx(3) }),
  ];
}

export function claim(over: Partial<PriorityClaim> = {}): PriorityClaim {
  return {
    claimId: "claim-1",
    collateralId: "col-1",
    tranche: "SENIOR",
    holder: "meridian",
    holderAddress: WALLET,
    principalUsd: 5_100,
    ratePct: 5,
    tokenId: "1155-1",
    priorityRank: 1,
    provenAt: { blockNumber: 6_182_101, txIndex: 17, seq: 1 },
    state: "ACTIVE",
    mintedAt: "2026-09-01T08:30:00.000Z",
    ...over,
  };
}

/** Senior / junior / subordinate, ranked and priced ordinally. */
export function threeClaims(): PriorityClaim[] {
  return [
    claim({ claimId: "c1", tranche: "SENIOR", holder: "meridian", principalUsd: 5_100, ratePct: 5, priorityRank: 1 }),
    claim({ claimId: "c2", tranche: "JUNIOR", holder: "vector", principalUsd: 2_550, ratePct: 10, priorityRank: 2 }),
    claim({ claimId: "c3", tranche: "SUBORDINATE", holder: "novum", principalUsd: 850, ratePct: 18, priorityRank: 3 }),
  ];
}

export function asset(over: Partial<CollateralAsset> = {}): CollateralAsset {
  return {
    id: "col-1",
    assetType: "warehouse-receipt",
    title: "Santos Arabica Coffee Warehouse Receipt #8802",
    symbol: "COFFEE-8802",
    obligor: "Atlas Coffee Importers LLC",
    obligorAddress: WALLET,
    custodian: "Santos Port Terminal #4 Vaults",
    custodianLocation: "Santos, Brazil",
    faceValueUsd: 10_000,
    financingRequestedUsd: 8_500,
    haircutPct: 15,
    advanceRatePct: 85,
    termDays: 90,
    currentRatePct: 8,
    targetRatePct: 5.2,
    docHash: ("0x" + "ab".repeat(32)) as Hex,
    nftTokenId: "8802",
    registryAddress: VAULT,
    vaultAddress: VAULT,
    status: "CLEAR",
    riskLabel: "Low",
    riskScore: 0.18,
    verifiedClearTitle: true,
    fetchedAt: "2026-09-01T00:00:00.000Z",
    source: "creditcoin-registry",
    ...over,
  };
}

export function extraction(over: Partial<DocumentExtraction> = {}): DocumentExtraction {
  return {
    collateralId: "col-1",
    faceValueUsd: 10_000,
    obligor: "Atlas Coffee Importers LLC",
    custodian: "Santos Port Terminal #4 Vaults",
    confidence: 0.95,
    source: "llm",
    model: "test-double",
    ratified: false,
    ratificationNotes: [],
    extractedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}
