/**
 * Seed data for PRECEDENCE.
 *
 * Provides realistic demo fixtures for autonomous financiers, real-world collateral assets,
 * verified Attestcoin priority proofs, and encumbrance records.
 *
 * Synthetic transaction hashes and proof IDs are prefixed with 0xSAMPLE.
 */
import type { Agent, Attestation, CollateralAsset, PriorityRace, RaceSummary } from "../types";
import { DbShape, emptyDb } from "./schema";
import { financierAddress } from "../domain/lock";

const T0 = "2026-09-01T00:00:00.000Z";

export function seedAgents(): Agent[] {
  return [
    {
      id: "meridian",
      name: "Meridian",
      role: "senior_financier",
      mandate: "Senior Mandate · Conservative",
      persona:
        "Conservative senior-lien mandate ($50k capital). Requires verified clear-title collateral and high face value. Bids exclusively for Senior tranche with first-priority claims.",
      identity: { tokenId: "1", registryAddress: ("0xSAMPLE_REGISTRY_" + "11".repeat(20)) as `0x${string}`, ownerAddress: "" },
      wallet: {
        publicKey: "0xSAMPLE_MERIDIAN_PUBLIC_KEY",
        address: financierAddress("meridian"),
        label: "Meridian · Senior Vault",
      },
      policy: {
        maxCapitalUsd: 50000,
        minRatePct: 4.5,
        riskTolerance: "conservative",
        maxRiskScore: 0.35,
        preferredTranche: "SENIOR",
        requiredClearTitle: true,
        maxLtvPct: 85,
        allowJoinSmaller: true,
        allowDemotion: false,
      },
      balanceUsd: 50000,
      reputation: { count: 18, avgScore: 94, verifiedProofs: 18 },
      stats: {
        racesJoined: 24,
        racesWon: 18,
        racesInitiated: 6,
        volumeSettledUsd: 142000,
        claimsActive: 4,
        defaultLossUsd: 0,
        totalEarnedUsd: 6840,
        winRatePct: 75,
        lastAction: "Settled Senior Lien on Atlas Coffee Receipt #8802",
        lastActionAt: "2026-09-01T08:30:00.000Z",
      },
      createdAt: T0,
    },
    {
      id: "vector",
      name: "Vector",
      role: "junior_financier",
      mandate: "Balanced Yield Mandate",
      persona:
        "Balanced yield operator ($20k capital). Accepts junior/mezzanine tranches to capture higher yield spreads behind proven senior capital.",
      identity: { tokenId: "2", registryAddress: ("0xSAMPLE_REGISTRY_" + "22".repeat(20)) as `0x${string}`, ownerAddress: "" },
      wallet: {
        publicKey: "0xSAMPLE_VECTOR_PUBLIC_KEY",
        address: financierAddress("vector"),
        label: "Vector · Junior Vault",
      },
      policy: {
        maxCapitalUsd: 20000,
        minRatePct: 6.5,
        riskTolerance: "balanced",
        maxRiskScore: 0.65,
        preferredTranche: "JUNIOR",
        requiredClearTitle: false,
        maxLtvPct: 90,
        allowJoinSmaller: true,
        allowDemotion: true,
      },
      balanceUsd: 20000,
      reputation: { count: 14, avgScore: 88, verifiedProofs: 14 },
      stats: {
        racesJoined: 19,
        racesWon: 14,
        racesInitiated: 4,
        volumeSettledUsd: 78000,
        claimsActive: 3,
        defaultLossUsd: 0,
        totalEarnedUsd: 5120,
        winRatePct: 74,
        lastAction: "Locked Junior Tranche on Apex Grain Receipt #8803",
        lastActionAt: "2026-09-01T07:15:00.000Z",
      },
      createdAt: T0,
    },
    {
      id: "novum",
      name: "Novum",
      role: "subordinate_financier",
      mandate: "Subordinate / First-Loss Mandate",
      persona:
        "Zero-track-record participant ($10k capital). Restricted by protocol policy to subordinate tranches and 2× capital bonding until proven across multiple rounds.",
      identity: { tokenId: "3", registryAddress: ("0xSAMPLE_REGISTRY_" + "33".repeat(20)) as `0x${string}`, ownerAddress: "" },
      wallet: {
        publicKey: "0xSAMPLE_NOVUM_PUBLIC_KEY",
        address: financierAddress("novum"),
        label: "Novum · Subordinate Vault",
      },
      policy: {
        maxCapitalUsd: 10000,
        minRatePct: 8.5,
        riskTolerance: "aggressive",
        maxRiskScore: 0.9,
        preferredTranche: "SUBORDINATE",
        requiredClearTitle: false,
        maxLtvPct: 95,
        allowJoinSmaller: false,
        allowDemotion: false,
      },
      balanceUsd: 10000,
      reputation: { count: 3, avgScore: 72, verifiedProofs: 3 },
      stats: {
        racesJoined: 6,
        racesWon: 3,
        racesInitiated: 1,
        volumeSettledUsd: 12500,
        claimsActive: 1,
        defaultLossUsd: 0,
        totalEarnedUsd: 1450,
        winRatePct: 50,
        lastAction: "Bid Subordinate Tranche on Santos Coffee Receipt #8802",
        lastActionAt: "2026-09-01T06:00:00.000Z",
      },
      createdAt: T0,
    },
    {
      id: "kestrel",
      name: "Kestrel",
      role: "prover",
      mandate: "Permissionless Truth Delivery",
      persona:
        "Autonomous Prover Agent. Queries Attestcoin precompile (0x0FD2 / 0x0FD3) and delivers Merkle + continuity proofs to Creditcoin CC3. Earns the first-valid-proof fee.",
      identity: { tokenId: "4", registryAddress: ("0xSAMPLE_REGISTRY_" + "44".repeat(20)) as `0x${string}`, ownerAddress: "" },
      wallet: {
        publicKey: "0xSAMPLE_KESTREL_PROVER_KEY",
        address: financierAddress("kestrel"),
        label: "Kestrel · Attestcoin Prover",
      },
      policy: {
        maxCapitalUsd: 15000,
        minRatePct: 0,
        riskTolerance: "conservative",
        maxRiskScore: 1.0,
        preferredTranche: "SENIOR",
        requiredClearTitle: false,
        maxLtvPct: 100,
        allowJoinSmaller: true,
        allowDemotion: false,
      },
      balanceUsd: 15000,
      reputation: { count: 42, avgScore: 99, verifiedProofs: 42 },
      stats: {
        racesJoined: 42,
        racesWon: 42,
        racesInitiated: 0,
        volumeSettledUsd: 380000,
        claimsActive: 0,
        defaultLossUsd: 0,
        totalEarnedUsd: 1900, // 5 bps prover fees
        winRatePct: 100,
        lastAction: "Batch proof delivered for Race #race-8802 (3 locks verified)",
        lastActionAt: "2026-09-01T08:35:00.000Z",
      },
      createdAt: T0,
    },
  ];
}

export function seedCollateral(): CollateralAsset[] {
  return [
    {
      id: "col-8802",
      assetType: "warehouse-receipt",
      title: "Santos Arabica Coffee Warehouse Receipt #8802",
      symbol: "COFFEE-8802",
      obligor: "Atlas Coffee Importers LLC",
      custodian: "Santos Port Terminal #4 Vaults",
      custodianLocation: "Santos, Brazil",
      faceValueUsd: 10000,
      financingRequestedUsd: 8500,
      haircutPct: 15,
      advanceRatePct: 85,
      termDays: 90,
      currentRatePct: 8.0,
      targetRatePct: 5.2,
      // Terms the OBLIGOR posted. Ordinal by construction — senior is protected by the tranches
      // beneath it, so it is the cheapest capital. The wide spread makes the risk premium legible.
      terms: {
        seniorCapUsd: 5100,
        juniorCapUsd: 2550,
        subordinateCapUsd: 850,
        seniorRatePct: 5,
        juniorRatePct: 10,
        subordinateRatePct: 18,
        termDays: 90,
        postedAt: "2026-09-01T08:05:00.000Z",
      },
      docHash: ("0xSAMPLE_DOC_HASH_COFFEE_8802_" + "aa".repeat(16)) as `0x${string}`,
      nftTokenId: "8802",
      registryAddress: ("0xSAMPLE_REGISTRY_CC3_" + "11".repeat(18)) as `0x${string}`,
      vaultAddress: ("0xSAMPLE_SEPOLIA_VAULT_" + "22".repeat(18)) as `0x${string}`,
      status: "CLEAR",
      riskLabel: "Low",
      riskScore: 0.18,
      verifiedClearTitle: true,
      fetchedAt: T0,
      source: "creditcoin-registry",
    },
    {
      id: "col-8803",
      assetType: "warehouse-receipt",
      title: "Apex Grain Grade-A Wheat Receipt #8803",
      symbol: "WHEAT-8803",
      obligor: "Apex Agricultural Partners",
      custodian: "Rotterdam Silo Terminals",
      custodianLocation: "Rotterdam, Netherlands",
      faceValueUsd: 25000,
      financingRequestedUsd: 21250,
      haircutPct: 15,
      advanceRatePct: 85,
      termDays: 90,
      currentRatePct: 6.8,
      targetRatePct: 5.8,
      docHash: ("0xSAMPLE_DOC_HASH_WHEAT_8803_" + "bb".repeat(16)) as `0x${string}`,
      nftTokenId: "8803",
      registryAddress: ("0xSAMPLE_REGISTRY_CC3_" + "11".repeat(18)) as `0x${string}`,
      vaultAddress: ("0xSAMPLE_SEPOLIA_VAULT_" + "22".repeat(18)) as `0x${string}`,
      status: "ENCUMBERED",
      riskLabel: "Medium",
      riskScore: 0.32,
      verifiedClearTitle: false,
      fetchedAt: T0,
      source: "creditcoin-registry",
    },
    {
      id: "col-8804",
      assetType: "trade-receivable",
      title: "Horizon Transatlantic Freight Receivable #8804",
      symbol: "FREIGHT-8804",
      obligor: "Horizon Cargo Lines Ltd",
      custodian: "Antwerp Trade Custody",
      custodianLocation: "Antwerp, Belgium",
      faceValueUsd: 15000,
      financingRequestedUsd: 12750,
      haircutPct: 15,
      advanceRatePct: 85,
      termDays: 60,
      currentRatePct: 7.5,
      targetRatePct: 6.2,
      docHash: ("0xSAMPLE_DOC_HASH_FREIGHT_8804_" + "cc".repeat(16)) as `0x${string}`,
      nftTokenId: "8804",
      registryAddress: ("0xSAMPLE_REGISTRY_CC3_" + "11".repeat(18)) as `0x${string}`,
      vaultAddress: ("0xSAMPLE_SEPOLIA_VAULT_" + "22".repeat(18)) as `0x${string}`,
      status: "CLEAR",
      riskLabel: "Low",
      riskScore: 0.22,
      verifiedClearTitle: true,
      fetchedAt: T0,
      source: "creditcoin-registry",
    },
    {
      id: "col-8805",
      assetType: "commodity-pledge",
      title: "Global Copper Bonded Cathodes Pledge #8805",
      symbol: "COPPER-8805",
      obligor: "Global Metals International S.A.",
      custodian: "Singapore Bonded Metal Logistics",
      custodianLocation: "Jurong Port, Singapore",
      faceValueUsd: 50000,
      financingRequestedUsd: 42500,
      haircutPct: 15,
      advanceRatePct: 85,
      termDays: 120,
      currentRatePct: 8.4,
      targetRatePct: 5.6,
      docHash: ("0xSAMPLE_DOC_HASH_COPPER_8805_" + "dd".repeat(16)) as `0x${string}`,
      nftTokenId: "8805",
      registryAddress: ("0xSAMPLE_REGISTRY_CC3_" + "11".repeat(18)) as `0x${string}`,
      vaultAddress: ("0xSAMPLE_SEPOLIA_VAULT_" + "22".repeat(18)) as `0x${string}`,
      status: "REFINANCED",
      riskLabel: "Medium",
      riskScore: 0.38,
      verifiedClearTitle: true,
      fetchedAt: T0,
      source: "creditcoin-registry",
    },
  ];
}

export function seedHistory(): { races: PriorityRace[]; attestations: Attestation[] } {
  const V = "0xSAMPLE_SEPOLIA_PRIORITY_VAULT_000000000000" as `0x${string}`;
  const TOK = "0xSAMPLE_SEPOLIA_PUSD_TOKEN_00000000000000000" as `0x${string}`;
  const CC3_SETTLE = ("0xSAMPLE_CC3_SETTLE_RACE_" + "44".repeat(16)) as `0x${string}`;

  /**
   * A completed, repaid facility on collateral #8802.
   *
   * This fixture deliberately puts ALL THREE locks in ONE Sepolia block (6182101). That is the
   * case the entire protocol turns on: block height alone cannot order them, so priority is
   * resolved by transaction index, derived on-chain from the Merkle proof via calculateTxIndex().
   * An oracle can assert an order here; it cannot cryptographically commit to one.
   *
   * It also shows the tranche rule (DECISIONS.md Q4): Novum ALSO bid SENIOR, was outpaced at
   * txIndex 41 by Meridian at txIndex 17, and is fully AUTO-REFUNDED rather than quietly demoted —
   * a financier who bid senior never consented to subordinate risk.
   *
   * Facility sizing on a $10,000 receipt with a 15% haircut: max draw $8,500 →
   * Senior $5,100 / Junior $2,550 / Subordinate $850.
   */
  const settledRace: PriorityRace = {
    id: "seed-race-8802",
    status: "SETTLED_CLOSED",
    track: "PERFORMING",
    scenario: "performing",
    obligor: seedCollateral()[0].obligor,
    collateral: seedCollateral()[0],
    requestedTotalUsd: 8500,
    decisions: [
      {
        agentId: "meridian",
        verb: "bid-senior",
        tranche: "SENIOR",
        amountUsd: 5100,
        ratePct: 5,
        expectedUtility: 14.8,
        reasoning: "Senior mandate approved: verified clear-title warehouse receipt, 15% haircut buffer.",
        source: "policy",
        decidedAt: "2026-09-01T08:15:00.000Z",
      },
      {
        agentId: "vector",
        verb: "bid-junior",
        tranche: "JUNIOR",
        amountUsd: 2550,
        ratePct: 10,
        expectedUtility: 18.2,
        reasoning: "Junior tranche accepted: 7.8% yield with senior subordination beneath it.",
        source: "policy",
        decidedAt: "2026-09-01T08:16:00.000Z",
      },
      {
        agentId: "novum",
        verb: "bid-senior",
        tranche: "SENIOR",
        amountUsd: 5100,
        ratePct: 5,
        expectedUtility: 8.5,
        reasoning: "No track record on Creditcoin; competing for senior with a 2x capital bond and no demotion consent.",
        source: "policy",
        decidedAt: "2026-09-01T08:17:00.000Z",
      },
    ],
    bids: [
      { agentId: "meridian", tranche: "SENIOR", requestedUsd: 5100, committedUsd: 5100, allowDemotion: false, lockBlockNumber: 6182101, lockTxIndex: 17, lockSeq: 1 },
      { agentId: "vector", tranche: "JUNIOR", requestedUsd: 2550, committedUsd: 2550, allowDemotion: false, lockBlockNumber: 6182101, lockTxIndex: 22, lockSeq: 2 },
      { agentId: "novum", tranche: "SENIOR", requestedUsd: 5100, committedUsd: 5100, allowDemotion: false, lockBlockNumber: 6182101, lockTxIndex: 41, lockSeq: 3 },
    ],
    locks: [
      {
        collateralId: "col-8802",
        financier: "meridian",
        financierAddress: financierAddress("meridian"),
        tranche: "SENIOR",
        amountUsd: 5100,
        lockBlockNumber: 6182101,
        lockTxIndex: 17, // earliest position in the block -> takes SENIOR
        seq: 1,
        token: TOK,
        sepoliaTxHash: ("0xSAMPLE_SEPOLIA_LOCK_MERIDIAN_" + "11".repeat(16)) as `0x${string}`,
        receiptStatus: 1,
        emittedBy: V,
        timestamp: "2026-09-01T08:18:00.000Z",
        refunded: false,
      },
      {
        collateralId: "col-8802",
        financier: "vector",
        financierAddress: financierAddress("vector"),
        tranche: "JUNIOR",
        amountUsd: 2550,
        lockBlockNumber: 6182101,
        lockTxIndex: 22, // same block, later index -> uncontested JUNIOR
        seq: 2,
        token: TOK,
        sepoliaTxHash: ("0xSAMPLE_SEPOLIA_LOCK_VECTOR_" + "22".repeat(16)) as `0x${string}`,
        receiptStatus: 1,
        emittedBy: V,
        timestamp: "2026-09-01T08:19:00.000Z",
        refunded: false,
      },
      {
        collateralId: "col-8802",
        financier: "novum",
        financierAddress: financierAddress("novum"),
        tranche: "SENIOR",
        amountUsd: 5100,
        lockBlockNumber: 6182101,
        lockTxIndex: 41, // same block, outpaced in SENIOR -> refunded, NOT demoted
        seq: 3,
        token: TOK,
        sepoliaTxHash: ("0xSAMPLE_SEPOLIA_LOCK_NOVUM_" + "33".repeat(16)) as `0x${string}`,
        receiptStatus: 1,
        emittedBy: V,
        timestamp: "2026-09-01T08:20:00.000Z",
        refunded: true,
      },
    ],
    proofRecord: {
      chainKey: 1,
      heights: [6182101, 6182101, 6182101],
      txIndices: [17, 22, 41],
      encodedTxs: [
        ("0xSAMPLE_TX_ENC_MERIDIAN_" + "11".repeat(16)) as `0x${string}`,
        ("0xSAMPLE_TX_ENC_VECTOR_" + "22".repeat(16)) as `0x${string}`,
        ("0xSAMPLE_TX_ENC_NOVUM_" + "33".repeat(16)) as `0x${string}`,
      ],
      merkleProofs: [17, 22, 41].map((idx) => ({
        root: ("0xSAMPLE_MERKLE_ROOT_6182101_" + "ee".repeat(16)) as `0x${string}`,
        siblings: [
          { hash: ("0xSAMPLE_SIB_A_" + String(idx).padStart(2, "0").repeat(24)) as `0x${string}`, isLeft: true },
          { hash: ("0xSAMPLE_SIB_B_" + String(idx).padStart(2, "0").repeat(24)) as `0x${string}`, isLeft: false },
        ],
      })),
      // One shared continuity proof covers all three — they are in the same block.
      continuityProof: {
        lowerEndpointDigest: ("0xSAMPLE_LOWER_ENDPOINT_" + "ff".repeat(16)) as `0x${string}`,
        roots: [("0xSAMPLE_CONTINUITY_ROOT_" + "ff".repeat(16)) as `0x${string}`],
      },
      batchSize: 3,
      preflightVerified: true,
      proofPipelineStatus: "VERIFIED",
      attestationLagMinutes: 8.0,
      attestedHeight: 6182101,
      proverAgent: "kestrel",
      precompile: "0x0000000000000000000000000000000000000FD2",
      creditcoinTxHash: CC3_SETTLE,
      verificationBlockNumber: 5412203,
      verifiedAt: "2026-09-01T08:30:00.000Z",
    },
    settlement: {
      collateralId: "col-8802",
      seniorFinancier: "meridian",
      seniorAmountUsd: 5100,
      juniorFinancier: "vector",
      juniorAmountUsd: 2550,
      refundedFinanciers: [
        {
          agentId: "novum",
          amountUsd: 5100,
          tranche: "SENIOR",
          reason:
            "Outpaced in SENIOR by MERIDIAN at proven position (block 6182101, txIndex 17), which filled the tranche — same block, earlier index. Capital returned, not demoted: a SENIOR bid does not consent to subordinate risk.",
        },
      ],
      provenOrder: [
        { agentId: "meridian", blockNumber: 6182101, txIndex: 17, seq: 1 },
        { agentId: "vector", blockNumber: 6182101, txIndex: 22, seq: 2 },
        { agentId: "novum", blockNumber: 6182101, txIndex: 41, seq: 3 },
      ],
      settlementBlock: 5412203,
      creditcoinTxHash: CC3_SETTLE,
      settledAt: "2026-09-01T08:30:00.000Z",
    },
    claims: [
      {
        claimId: "claim-col-8802-senior-meridian",
        collateralId: "col-8802",
        tranche: "SENIOR",
        holder: "meridian",
        holderAddress: financierAddress("meridian"),
        principalUsd: 5100,
        ratePct: 5,
        tokenId: "1155-1",
        priorityRank: 1,
        provenAt: { blockNumber: 6182101, txIndex: 17, seq: 1 },
        state: "REPAID",
        mintedAt: "2026-09-01T08:30:00.000Z",
      },
      {
        claimId: "claim-col-8802-junior-vector",
        collateralId: "col-8802",
        tranche: "JUNIOR",
        holder: "vector",
        holderAddress: financierAddress("vector"),
        principalUsd: 2550,
        ratePct: 10,
        tokenId: "1155-2",
        priorityRank: 2,
        provenAt: { blockNumber: 6182101, txIndex: 22, seq: 2 },
        state: "REPAID",
        mintedAt: "2026-09-01T08:30:00.000Z",
      },
    ],
    draw: {
      collateralId: "col-8802",
      obligor: seedCollateral()[0].obligor,
      amountUsd: 7650,
      maxDrawUsd: 8500,
      sepoliaTxHash: ("0xSAMPLE_SEPOLIA_DRAW_8802_" + "55".repeat(16)) as `0x${string}`,
      blockNumber: 6182115,
      drawnAt: "2026-09-01T08:35:00.000Z",
    },
    repayment: {
      collateralId: "col-8802",
      obligor: seedCollateral()[0].obligor,
      principalUsd: 7650,
      interestUsd: 126,
      totalUsd: 7810,
      sepoliaTxHash: ("0xSAMPLE_SEPOLIA_REPAY_8802_" + "66".repeat(16)) as `0x${string}`,
      blockNumber: 6182150,
      provenAmountUsd: 7810,
      proofPipelineStatus: "VERIFIED",
      creditcoinTxHash: ("0xSAMPLE_CC3_REPAY_VERIFIED_" + "77".repeat(16)) as `0x${string}`,
      repaidAt: "2026-09-01T08:40:00.000Z",
    },
    // Strict seniority: SENIOR satisfied in full before JUNIOR received anything.
    waterfall: {
      realizedRepaymentUsd: 7810,
      protocolFeeUsd: 19.52,
      proverFeeUsd: 3.9,
      distributableUsd: 7786.58,
      kind: "REPAYMENT",
      lines: [
        {
          agentId: "meridian",
          tranche: "SENIOR",
          priorityRank: 1,
          contributedUsd: 5100,
          interestDueUsd: 62.88,
          interestEarnedUsd: 62.88,
          principalReturnedUsd: 5100,
          lossAbsorbedUsd: 0,
          payoutUsd: 5162.88,
          satisfiedInFull: true,
        },
        {
          agentId: "vector",
          tranche: "JUNIOR",
          priorityRank: 2,
          contributedUsd: 2550,
          interestDueUsd: 62.88,
          interestEarnedUsd: 62.88,
          principalReturnedUsd: 2550,
          lossAbsorbedUsd: 0,
          payoutUsd: 2612.88,
          satisfiedInFull: true,
        },
      ],
      unallocatedUsd: 10.82,
      computedAt: "2026-09-01T08:42:00.000Z",
    },
    createdAt: "2026-09-01T08:10:00.000Z",
    updatedAt: "2026-09-01T08:42:00.000Z",
  };

  const attestation: Attestation = {
    raceId: "seed-race-8802",
    collateralId: "col-8802",
    proverId: "kestrel",
    claimTokenId: "1155-8802",
    sepoliaTxHash: ("0xSAMPLE_SEPOLIA_LOCK_MERIDIAN_" + "11".repeat(16)) as `0x${string}`,
    creditcoinTxHash: CC3_SETTLE,
    sourceBlockNumber: 6182101,
    sourceTxIndex: 17,
    score: 95,
    status: "confirmed",
    // Verified-reachable explorer bases. explorer.cc3-testnet.creditcoin.network does NOT resolve.
    explorerUrl: `https://creditcoin-testnet.blockscout.com/tx/${CC3_SETTLE}`,
    sourceExplorerUrl: `https://sepolia.etherscan.io/tx/0xSAMPLE_SEPOLIA_LOCK_MERIDIAN`,
    attestedAt: "2026-09-01T08:31:00.000Z",
  };

  return { races: [settledRace], attestations: [attestation] };
}

export function seedDb(): DbShape {
  const db = emptyDb();
  db.agents = seedAgents();
  db.collateral = seedCollateral();
  const { races, attestations } = seedHistory();
  db.races = races;
  db.attestations = attestations;
  return db;
}

export function toRaceSummary(r: PriorityRace): RaceSummary {
  const totalCapitalUsd = r.bids.reduce((s, b) => s + b.committedUsd, 0) || r.requestedTotalUsd;

  let outcome: RaceSummary["outcome"] = "in-progress";
  if (r.status === "ABORTED") outcome = "rejected";
  else if (r.status === "TERMINATED_DEFAULT") outcome = "defaulted";
  else if (r.status === "AUTO_REFUND") outcome = "lost";
  else if (r.status === "SETTLED_CLOSED") outcome = "won";

  return {
    id: r.id,
    status: r.status,
    track: r.track,
    collateralSymbol: r.collateral.symbol,
    obligor: r.obligor || r.collateral.obligor,
    bidCount: r.bids.length,
    totalCapitalUsd,
    targetRatePct: r.collateral.targetRatePct,
    seniorFinancier: r.settlement?.seniorFinancier,
    outcome,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export const toSummary = toRaceSummary;
