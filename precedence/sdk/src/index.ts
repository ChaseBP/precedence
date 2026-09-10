/**
 * `@precedence/sdk` — lien priority by proven source-block position.
 *
 * @remarks What this package contains is the part of PRECEDENCE that is not a web application:
 * the protocol's data model, the mathematics that turns a set of proven positions into a
 * settlement, and the client for Attestcoin's ChainInfo precompile.
 *
 * The one idea everything else serves is in {@link compareProvenOrder}. A lender's priority is
 * the canonical position of their lock on the source chain — `(blockHeight, txIndex)` — and not
 * the order their paperwork reached a registry. Height alone cannot separate two locks in the
 * same block, which is the case the design exists for, so the index is half the claim; on
 * Creditcoin it is re-derived from the Merkle path by `calculateTxIndex` at
 * `0x0FD2` rather than asserted by anyone.
 *
 * Three things deliberately are NOT here:
 *
 * - **Writes.** Nothing in this package signs or submits anything. Proof submission needs a key
 *   and minutes of waiting, which belongs in a worker process.
 * - **The source-chain verifier.** Turning a transaction hash into a `VerifiedLock` needs the
 *   deployed vault's full ABI, so it currently lives with the application
 *   (`precedence/lib/precedence/adapters/sepolia/sepolia-reader.ts`). It is the next thing worth
 *   extracting, and it is named here rather than quietly omitted.
 * - **Anything a model produces.** {@link ratifyExtraction} is the seam: a model may propose, and
 *   this rejects by default and reports a disagreement as a flag rather than a correction.
 *   Settlement never depends on a model.
 *
 * ```ts
 * import { sortByProvenOrder, settlePriorityLocks, AttestcoinChainInfo } from "@precedence/sdk";
 *
 * // Rank locks the way a proof will, including a same-block tie.
 * const ranked = sortByProvenOrder(locks);
 *
 * // Is the source block inside Attestcoin's frontier yet?
 * const chain = new AttestcoinChainInfo();
 * const ready = await chain.isAttested(Math.max(...locks.map((l) => l.lockBlockNumber)));
 * ```
 */

/** The protocol's data model: collateral, races, locks, claims, proofs, settlements. */
export * from "./types";

/** Canonical hashing — the document hash a facility is identified by. */
export * from "./hash";

/**
 * Priority ordering and settlement.
 *
 * `compareProvenOrder` is the trust root; `settlePriorityLocks` allocates ranked locks into
 * declared tranches; `checkSeqContiguity` and `checkStrictOrdering` are the invariants a proof
 * must satisfy before it is worth submitting.
 */
export * from "./domain/lock";

/** Strict-seniority payout. A junior tranche is never paid while a senior one is short. */
export * from "./domain/waterfall";

/**
 * Protocol constants and proof shapes, including the MEASURED attestation latency.
 *
 * Quote `MEASURED_ATTESTATION_LAG` as a range and never as a single figure: attestation advances
 * in batches, so the lag is a sawtooth rather than an average.
 */
export * from "./domain/proof";

/** Collateral analysis, haircut arithmetic and the terms validation the contract mirrors. */
export * from "./domain/collateral";

/** Deterministic financier policy. Bids are policy, always — never a model's opinion. */
export * from "./domain/policy";

/** The ratification seam a model's output has to pass, which rejects by default. */
export * from "./domain/ratify";

/** Refinance arbitrage discovery and the atomic replacement record. */
export * from "./domain/refinance";

/** The deterministic unwind: freeze, coverage, grace, Dutch liquidation, default. */
export * from "./domain/distress";

/** Attestcoin's ChainInfo precompile, and the frontier arithmetic the wait is reported from. */
export * from "./attestcoin";
