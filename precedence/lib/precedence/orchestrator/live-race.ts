/**
 * Races that exist on chain, as opposed to scripted ones.
 *
 * @remarks This module is the answer to a real gap. `createRace` builds a *walkthrough*: it runs
 * the whole lifecycle against simulated adapters in seconds, marks itself `simulated: true`, and
 * every hash it produces is fabricated — correctly, because a genuine settlement needs a proven
 * Sepolia lock and minutes of attestation and cannot be what a button produces.
 *
 * The gap was that nothing built the other kind. A borrower could open a race on the vault and a
 * lender could lock capital into it, both signing real transactions from their own wallets, and
 * none of it was represented in the app at all. So the only race the interface could ever display
 * was the scripted one, and every hash on the page was correctly labelled a sample — which read,
 * accurately, as though the project had no live path.
 *
 * Nothing here advances a lifecycle or invents a state. It records what the chain already says:
 * a race exists because `RaceOpened` was emitted, and it has the locks that `Lock_` events prove.
 * `runRace` is deliberately never called on one of these — the phases past `RACE_OPEN` belong to
 * the prover worker, which needs attestation of the source block before it can honestly claim
 * priority is settled.
 */
import type { Hex, PriorityRace, SourceLockRecord, Tranche } from "../types";
import {
  getCollateral,
  getRace,
  listRacesFull,
  saveRace,
  updateCollateral,
} from "../store/repositories";
import { analyzeCollateral } from "../domain/collateral";
import { CREDITCOIN_RPC_DEFAULT, getConfig } from "../config";

/** Attestcoin's chainKey for Sepolia. Docs-confirmed. */
const SEPOLIA_CHAIN_KEY_NUM = 1;
import {
  getSepoliaReader,
  NotVerifiableError,
  SEPOLIA_CHAIN_ID,
} from "../adapters/sepolia/sepolia-reader";

// Re-exported so a route can classify a failure without reaching into the adapter layer.
export { NotVerifiableError };

/** A live race's own id, so it is recognisable in a store beside scripted ones. */
const liveId = (collateralId: string, raceNonce: number) =>
  `live-${collateralId.slice(2, 10)}-${raceNonce}`;

/**
 * The live race for a collateral, if the app knows about one.
 *
 * @remarks Keyed on the vault's `raceNonce`, not on time. A facility can be financed more than
 * once, and the vault resets its lock counter each time — so a second race is a genuinely
 * different set of positions and must not append to the first, or the completeness check ("seq
 * contiguous from 1") would be asserted over two races spliced together. That is one of the
 * attacks the gate rejects, and it would be self-inflicted here.
 */
export async function findLiveRace(
  collateralId: string,
  raceNonce?: number,
): Promise<PriorityRace | undefined> {
  const all = await listRacesFull();
  const mine = all.filter((r) => r.onchain?.collateralId?.toLowerCase() === collateralId.toLowerCase());
  if (raceNonce !== undefined) return mine.find((r) => r.onchain?.raceNonce === raceNonce);
  // Most recent nonce wins: an older race on the same facility is history, not the open one.
  return mine.sort((a, b) => (b.onchain?.raceNonce ?? 0) - (a.onchain?.raceNonce ?? 0))[0];
}

export interface OpenLiveRaceParams {
  collateralId: string;
  /** The `openRace` transaction the caller signed. Verified, not trusted. */
  openTxHash: Hex;
  /** The `registerCollateral` transaction, when this caller also sent it. */
  registerTxHash?: Hex;
}

/**
 * Record a race the caller has already opened on the Sepolia vault.
 *
 * @remarks Idempotent by `(collateralId, raceNonce)`, both of which come from the decoded event.
 * A double-submit — two tabs, an impatient retry, a component remounting — must not produce two
 * records of one race, and cannot, because the nonce is the vault's and not ours.
 */
export async function openLiveRace(params: OpenLiveRaceParams): Promise<PriorityRace> {
  const collateral = await getCollateral(params.collateralId);
  if (!collateral) throw new NotVerifiableError(`No collateral "${params.collateralId}" is on record.`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(collateral.docHash)) {
    throw new NotVerifiableError(
      "This facility's document hash is a visible placeholder, not a registered document, so no " +
        "vault position exists for it.",
    );
  }

  const got = getSepoliaReader();
  if (!got.reader) throw new NotVerifiableError(got.why);
  const reader = got.reader;

  // The receipt is the evidence. Everything below is decoded out of it or read from vault storage.
  const open = await reader.verifyRaceOpen(params.openTxHash, collateral.docHash);
  const state = await reader.raceState(collateral.docHash);

  if (!state.registered) {
    throw new NotVerifiableError(
      `The vault at ${reader.vaultAddress} does not have this collateral registered, so the ` +
        `transaction cannot belong to a race on it.`,
    );
  }
  if (state.raceNonce !== open.raceNonce) {
    // A stale receipt from a previous financing round. Real, but not the current race.
    throw new NotVerifiableError(
      `That transaction opened race ${open.raceNonce}, but the vault is now on race ` +
        `${state.raceNonce}. It has been superseded.`,
    );
  }

  const existing = await findLiveRace(collateral.docHash, open.raceNonce);
  if (existing) return existing;

  const requestedTotalUsd = open.facilitySizeUsd;
  const now = new Date().toISOString();
  const race: PriorityRace = {
    id: liveId(collateral.docHash, open.raceNonce),
    // The one place in the app that sets this false, and it does so only after a receipt for the
    // opening transaction came back from an RPC.
    simulated: false,
    onchain: {
      chainId: SEPOLIA_CHAIN_ID,
      vaultAddress: reader.vaultAddress,
      collateralId: collateral.docHash,
      obligor: state.obligor,
      registerTxHash: params.registerTxHash,
      openTxHash: open.txHash,
      openBlockNumber: open.blockNumber,
      raceNonce: open.raceNonce,
      raceDeadline: open.deadline,
      facilitySizeUsd: open.facilitySizeUsd,
      creditcoinRegisterTx: collateral.onChainRefs?.creditcoinRegisterTx,
      creditcoinTermsTx: collateral.onChainRefs?.creditcoinTermsTx,
    },
    // RACE_OPEN and no further. Priority is not settled until a proof exists, and pretending
    // otherwise here is the exact overclaim `ProvenOrder` was rewritten to avoid.
    status: "RACE_OPEN",
    track: "PERFORMING",
    scenario: "performing",
    obligor: collateral.obligor,
    collateral,
    analysis: analyzeCollateral(collateral, requestedTotalUsd),
    requestedTotalUsd,
    decisions: [],
    bids: [],
    locks: [],
    proverCalls: [],
    claims: [],
    createdAt: now,
    updatedAt: now,
  };

  await saveRace(race);
  // So the facility page's own guards agree with the vault. `LockCapital` accepts bids while a
  // collateral is CLEAR or RACE_OPEN, and leaving this at CLEAR made the facility header and the
  // vault badge disagree about whether a race was running.
  await updateCollateral(collateral.id, (c) => {
    c.status = "RACE_OPEN";
  });
  return race;
}

/**
 * Rebuild a settlement's record from the chain, given only the facility.
 *
 * @remarks The recovery path, and the reason a lost store never has to cost anyone a live run
 * again. Everything that matters is on chain: the vault holds the race and its locks, and the
 * attestation of the source block is a fact about Attestcoin, not about us. What is lost when the
 * store goes — a restart with no `PRECEDENCE_STORE_PATH`, an admin reset, a fresh clone — is only
 * this app's note of it, and a note can be rewritten.
 *
 * Takes no transaction hashes. `openLiveRace` and `appendLiveLock` need them because they are
 * recording something the caller has *just done*, and a claim by a party has to be verified. Here
 * the chain is the only source of anything, so there is nothing to distrust and nothing to supply.
 *
 * The opening transaction is the one thing that cannot be recovered: the vault does not store it
 * and finding it would mean scanning for a `RaceOpened` log with no idea which block to look in.
 * So `openTxHash` is left unset and the receipts card shows one fewer row, which is correct — we
 * genuinely do not know it.
 */
export async function recoverLiveRace(collateralId: string): Promise<PriorityRace> {
  const collateral = await getCollateral(collateralId);
  if (!collateral) throw new NotVerifiableError(`No collateral "${collateralId}" is on record.`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(collateral.docHash)) {
    throw new NotVerifiableError(
      "This facility's document hash is a placeholder, not a registered document, so the vault has " +
        "nothing to recover.",
    );
  }

  const got = getSepoliaReader();
  if (!got.reader) throw new NotVerifiableError(got.why);
  const reader = got.reader;

  const state = await reader.raceState(collateral.docHash);
  if (!state.registered) {
    throw new NotVerifiableError(
      `The vault at ${reader.vaultAddress} has never seen this document, so there is no settlement ` +
        `to recover.`,
    );
  }
  if (state.raceNonce === 0) {
    throw new NotVerifiableError("No race has ever been opened on this facility.");
  }

  const locks = await reader.locksFromChain(collateral.docHash, state.raceNonce);

  const existing = await findLiveRace(collateral.docHash, state.raceNonce);
  const now = new Date().toISOString();
  const base: PriorityRace =
    existing ??
    {
      id: liveId(collateral.docHash, state.raceNonce),
      simulated: false,
      onchain: {
        chainId: SEPOLIA_CHAIN_ID,
        vaultAddress: reader.vaultAddress,
        collateralId: collateral.docHash,
        obligor: state.obligor,
        // Not knowable from storage. Left unset rather than guessed — see above.
        openTxHash: undefined,
        openBlockNumber: locks.length ? Math.min(...locks.map((l) => l.lockBlockNumber)) : 0,
        raceNonce: state.raceNonce,
        raceDeadline: state.raceDeadline,
        facilitySizeUsd: state.facilitySizeUsd,
        creditcoinRegisterTx: collateral.onChainRefs?.creditcoinRegisterTx,
        creditcoinTermsTx: collateral.onChainRefs?.creditcoinTermsTx,
      },
      status: "RACE_OPEN",
      track: "PERFORMING",
      scenario: "performing",
      obligor: collateral.obligor,
      collateral,
      analysis: analyzeCollateral(collateral, state.facilitySizeUsd),
      requestedTotalUsd: state.facilitySizeUsd,
      decisions: [],
      bids: [],
      locks: [],
      proverCalls: [],
      claims: [],
      createdAt: now,
      updatedAt: now,
    };

  const recovered: PriorityRace = { ...base, locks, updatedAt: now };
  await saveRace(recovered);
  await updateCollateral(collateral.id, (c) => {
    if (c.status === "CLEAR") c.status = "RACE_OPEN";
  });
  return recovered;
}

export interface AppendLiveLockParams {
  collateralId: string;
  /** The `lock` transaction the lender signed from their own wallet. */
  lockTxHash: Hex;
}

/**
 * Record a lock a lender has already sent, with the position the chain gives it.
 *
 * @remarks `lockTxIndex` here is the receipt's `transactionIndex`, which is the same quantity the
 * precompile re-derives from the Merkle path when the race is proven. Carrying it now is what lets
 * the interface show a rank before attestation completes — badged OBSERVED rather than PROVEN,
 * because until `calculateTxIndex` confirms it on Creditcoin this is our reading of the source
 * chain and not yet a proof. The two are compared when the proof lands; a disagreement is a
 * finding, not something to paper over.
 */
export async function appendLiveLock(params: AppendLiveLockParams): Promise<PriorityRace> {
  const got = getSepoliaReader();
  if (!got.reader) throw new NotVerifiableError(got.why);
  const reader = got.reader;

  const collateral = await getCollateral(params.collateralId);
  if (!collateral) throw new NotVerifiableError(`No collateral "${params.collateralId}" is on record.`);

  const lock = await reader.verifyLock(params.lockTxHash, collateral.docHash);
  let race = await findLiveRace(collateral.docHash, lock.raceNonce);

  // A lock can legitimately arrive before the app has a record of the race — a lender bidding
  // into a race opened from a different browser, or from the CLI. Recover the race from the
  // vault rather than dropping a real lock on the floor.
  if (!race) {
    const state = await reader.raceState(collateral.docHash);
    if (state.raceNonce !== lock.raceNonce) {
      throw new NotVerifiableError(
        `That lock belongs to race ${lock.raceNonce}; the vault is on race ${state.raceNonce}.`,
      );
    }
    const now = new Date().toISOString();
    race = {
      id: liveId(collateral.docHash, lock.raceNonce),
      simulated: false,
      onchain: {
        chainId: SEPOLIA_CHAIN_ID,
        vaultAddress: reader.vaultAddress,
        collateralId: collateral.docHash,
        obligor: state.obligor,
        // No opening receipt to point at: this app did not see that transaction. Putting the
        // lock's own hash here would label a real transaction as something it is not, so the
        // field is left unset and the UI shows one fewer link rather than a wrong one.
        openTxHash: undefined,
        openBlockNumber: lock.blockNumber,
        raceNonce: lock.raceNonce,
        raceDeadline: state.raceDeadline,
        facilitySizeUsd: state.facilitySizeUsd,
        creditcoinRegisterTx: collateral.onChainRefs?.creditcoinRegisterTx,
        creditcoinTermsTx: collateral.onChainRefs?.creditcoinTermsTx,
      },
      status: "RACE_OPEN",
      track: "PERFORMING",
      scenario: "performing",
      obligor: collateral.obligor,
      collateral,
      analysis: analyzeCollateral(collateral, state.facilitySizeUsd),
      requestedTotalUsd: state.facilitySizeUsd,
      decisions: [],
      bids: [],
      locks: [],
      proverCalls: [],
      claims: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  const record: SourceLockRecord = {
    collateralId: collateral.id,
    // The wallet that signed it, which is the only identity a lock has on chain. There is no
    // agent behind a live lock, and naming one of ours would attribute a stranger's capital to a
    // house financier.
    financier: lock.financier,
    financierAddress: lock.financier,
    tranche: lock.tranche,
    amountUsd: lock.amountUsd,
    lockBlockNumber: lock.blockNumber,
    lockTxIndex: lock.txIndex,
    seq: lock.seq,
    token: lock.token,
    sepoliaTxHash: lock.txHash,
    // Asserted only because `verifyLock` refuses a receipt whose status is not success.
    receiptStatus: 1,
    emittedBy: lock.emittedBy,
    timestamp: new Date().toISOString(),
    refunded: false,
  };

  // Idempotent by transaction hash: the same lock submitted twice is one lock. Ordering is by
  // (height, txIndex) — the priority root — so the stored array is already in rank order and the
  // UI does not depend on a client having sorted it.
  const locks = race.locks.filter((l) => l.sepoliaTxHash.toLowerCase() !== record.sepoliaTxHash.toLowerCase());
  locks.push(record);
  locks.sort((a, b) => a.lockBlockNumber - b.lockBlockNumber || a.lockTxIndex - b.lockTxIndex);

  const updated: PriorityRace = { ...race, locks, updatedAt: new Date().toISOString() };
  await saveRace(updated);
  return updated;
}

/**
 * Write a completed proof onto the race, from the evidence the worker produced.
 *
 * @remarks Nothing here is composed by this app. Every figure comes out of the evidence file the
 * prover wrote, and every figure in that file was read back from a chain: the proven positions
 * from `calculateTxIndex` on the precompile, the awards from the engine's own settled stack, the
 * transaction hash and block from the Creditcoin receipt.
 *
 * The settlement transaction is nonetheless re-verified against Creditcoin before any of it is
 * stored. The evidence file is ours and could in principle be stale or hand-edited, and this is
 * the record that flips the interface from OBSERVED to PROVEN — the single boldest claim the app
 * makes. It does not get to rest on a local JSON file.
 *
 * Idempotent: a race that already carries a settlement is returned untouched.
 */
export async function applyProvenSettlement(
  raceId: string,
  evidencePath: string,
): Promise<PriorityRace | undefined> {
  const race = await getRace(raceId);
  if (!race?.onchain) return undefined;
  if (race.settlement) return race;

  const { readFileSync, existsSync } = await import("node:fs");
  const { isAbsolute, resolve } = await import("node:path");
  const path = isAbsolute(evidencePath) ? evidencePath : resolve(process.cwd(), "..", evidencePath);
  if (!existsSync(path)) throw new Error(`no evidence at ${path}`);

  const ev = JSON.parse(readFileSync(path, "utf8")) as {
    collateralId: string;
    attestation?: { attestedHeight?: number; waitMinutes?: number };
    creditcoin: {
      settleTxHash: string;
      blockNumber: number;
      provenPositions: { height: number; txIndex: number; financier: string }[];
    };
    settlement: {
      awards: { financier: string; tranche: string; rank: number; amount: string; height: number; txIndex: number }[];
      refunds: { financier: string; tranche: string; amount: string }[];
    };
    crossCheck?: { agrees?: boolean };
  };

  if (ev.collateralId.toLowerCase() !== race.onchain.collateralId.toLowerCase()) {
    throw new Error("that evidence belongs to a different facility");
  }

  const settleTx = ev.creditcoin.settleTxHash;
  if (!/^0x[0-9a-fA-F]{64}$/.test(settleTx)) throw new Error("the evidence carries no settlement hash");

  // The re-verification. A receipt that is missing or reverted means no settlement happened,
  // whatever the file says.
  const { createPublicClient, http } = await import("viem");
  const cc = createPublicClient({
    transport: http(getConfig().creditcoinRpc || CREDITCOIN_RPC_DEFAULT),
  });
  const receipt = await cc.getTransactionReceipt({ hash: settleTx as `0x${string}` });
  if (receipt.status !== "success") {
    throw new Error(`the settlement transaction ${settleTx} reverted on Creditcoin`);
  }

  const usdOf = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;
  const pick = (t: string) => ev.settlement.awards.find((a) => a.tranche === t);
  const senior = pick("SENIOR");
  const junior = pick("JUNIOR");
  const sub = pick("SUBORDINATE");

  const now = new Date().toISOString();
  const updated: PriorityRace = {
    ...race,
    status: "PRIORITY_SETTLED",
    settlement: {
      collateralId: race.collateral.id,
      // The wallet that holds each rank. There are no house agents in a live race, so the address
      // IS the identity — naming one of ours here would attribute a stranger's capital.
      seniorFinancier: senior?.financier ?? "",
      seniorAmountUsd: senior ? usdOf(senior.amount) : 0,
      juniorFinancier: junior?.financier ?? "",
      juniorAmountUsd: junior ? usdOf(junior.amount) : 0,
      subordinateFinancier: sub?.financier,
      subordinateAmountUsd: sub ? usdOf(sub.amount) : undefined,
      refundedFinanciers: ev.settlement.refunds.map((r) => ({
        agentId: r.financier,
        amountUsd: usdOf(r.amount),
        tranche: (["SENIOR", "JUNIOR", "SUBORDINATE"] as const).includes(r.tranche as Tranche)
          ? (r.tranche as Tranche)
          : "SUBORDINATE",
        reason: `declared ${r.tranche}, outpaced for that rank — reclaimable in full`,
      })),
      // As the precompile derived them, in the order the gate enforced.
      provenOrder: ev.creditcoin.provenPositions.map((p, i) => ({
        agentId: p.financier,
        blockNumber: p.height,
        txIndex: p.txIndex,
        seq: i + 1,
      })),
      settlementBlock: ev.creditcoin.blockNumber,
      creditcoinTxHash: settleTx as Hex,
      settledAt: now,
    },
    proofRecord: {
      ...(race.proofRecord ?? {
        chainKey: SEPOLIA_CHAIN_KEY_NUM,
        heights: [],
        txIndices: [],
        encodedTxs: [],
        merkleProofs: [],
        continuityProof: { lowerEndpointDigest: "0x" as Hex, roots: [] },
        batchSize: 0,
        preflightVerified: false,
        proofPipelineStatus: "VERIFIED",
        attestationLagMinutes: 0,
        proverAgent: "worker",
        precompile: "0x0FD2" as Hex,
      }),
      chainKey: SEPOLIA_CHAIN_KEY_NUM,
      heights: ev.creditcoin.provenPositions.map((p) => p.height),
      txIndices: ev.creditcoin.provenPositions.map((p) => p.txIndex),
      batchSize: ev.creditcoin.provenPositions.length,
      proofPipelineStatus: "VERIFIED",
      attestationLagMinutes: ev.attestation?.waitMinutes ?? 0,
      attestedHeight: ev.attestation?.attestedHeight,
      preflightVerified: ev.crossCheck?.agrees ?? false,
      creditcoinTxHash: settleTx as Hex,
      verificationBlockNumber: ev.creditcoin.blockNumber,
      verifiedAt: now,
    },
    updatedAt: now,
  };

  await saveRace(updated);
  await updateCollateral(race.collateral.id, (c) => {
    c.status = "PRIORITY_SETTLED";
  });
  return updated;
}
