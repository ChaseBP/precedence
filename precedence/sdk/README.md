# `@precedence/sdk`

Lien priority by proven source-block position.

This package is the part of PRECEDENCE that is not a web application: the protocol's data model,
the mathematics that turns proven positions into a settlement, and the client for Attestcoin's
ChainInfo precompile. No React, no Next, no server. One peer dependency, `viem`.

```bash
bun test        # 303 tests
bun run typecheck
```

## The one idea

A lender's priority is the canonical position of their lock on the source chain — `(blockHeight,
txIndex)` — and not the order their paperwork reached a registry.

Height alone cannot separate two locks in the same block, and that is not an edge case; it is the
case the design exists for. The index inside the block is the other half of the position, and on
Creditcoin it is re-derived from the Merkle path by `calculateTxIndex` at `0x0FD2` rather than
asserted by anyone.

```ts
import { sortByProvenOrder, settlePriorityLocks } from "@precedence/sdk";

// Three locks, all in block 6,182,101. Height cannot order them; the index can.
const ranked = sortByProvenOrder(locks);           // meridian(17), vector(22), novum(41)

const { settlement, claims, refunds } = settlePriorityLocks("col-8802", locks, {
  seniorUsd: 5_100,
  juniorUsd: 2_550,
  subordinateUsd: 850,
});
// meridian takes SENIOR at index 17.
// novum ALSO bid senior, was outpaced at index 41, and is refunded IN FULL — not demoted.
```

That refund is the rule people find surprising, and it is deliberate: a financier who priced
senior protection never consented to junior risk. Demotion exists but is opt-in per financier,
which is the only version of it that is honest.

## Is the source block attested yet?

```ts
import { AttestcoinChainInfo, blocksToAttestation } from "@precedence/sdk";

const chain = new AttestcoinChainInfo();               // CC3 testnet by default
const frontier = await chain.frontier();               // 0x0FD3, snake_case methods
const target = Math.max(...locks.map((l) => l.lockBlockNumber));

if (await chain.isAttested(target)) {
  // everything a proof needs exists
} else {
  console.log(`${blocksToAttestation(target, frontier)} blocks to go`);
}
```

`isAttested` is a separate call rather than `frontier.attestedHeight >= target`. Attestation
advances in ten-block batches and the precompile is the authority on what is actually inside one;
deriving it from a comparison puts our arithmetic where the chain's answer belongs, and the two are
not guaranteed to agree at a boundary.

## Latency is measured, not documented

```ts
import { MEASURED_ATTESTATION_LAG, HONEST_LATENCY_COPY } from "@precedence/sdk";
// { minMinutes: 6.5, maxMinutes: 9.3, p50Minutes: 7.8, p90Minutes: 8.6, samples: 239, … }
```

Attestcoin publishes no figure for this, so it is sampled continuously instead. **Quote the range,
never a single number** — attestation advances in batches, so the lag is a sawtooth rather than an
average, and an average describes it wrongly. And "one Creditcoin block" refers to verification
plus the state transition *after* the proof exists; it is never a claim that proving is instant.

## What the precompile does not check

Two holes the reference integration leaves open, both closed by `enforceDappSideChecks`:

```ts
import { enforceDappSideChecks } from "@precedence/sdk";

const { ok, failures } = enforceDappSideChecks(locks, registeredVaultAddress);
```

1. **`receipt.status`.** The precompile verifies *inclusion*, not success. A reverted lock is a
   genuinely included transaction with a real block and a real index, so without this check it
   would win a rank for free.
2. **The emitting contract.** The reference base never records *who* emitted the verified
   transaction, so a perfectly valid proof of a look-alike contract's identically-shaped `Lock_`
   event would verify. Every proof has to be bound to the collateral's registered vault.

`batchFits`, `checkSeqContiguity` and `checkStrictOrdering` mirror the on-chain gate's own
requirements, so a prover discovers locally that a submission would be rejected instead of
discovering it by spending gas. `checkSeqContiguity` is the interesting one: the gate requires
`seq` contiguous from 1, which makes it impossible to omit a *middle* lock to promote a friend.
Only tail truncation is possible, and a truncated tail drops later — more junior — locks, whose
holders can submit their own proof.

## The model seam

```ts
import { ratifyExtraction, sanitizeNarration } from "@precedence/sdk";
```

A model may propose; deterministic policy ratifies. `ratifyExtraction` rejects every field by
default, never overwrites the registered record, and reports a document/registration disagreement
as a **flag** rather than applying it as a correction — that disagreement is exactly the situation
a person should look at. Settlement never depends on a model.

## What is deliberately not here

- **Writes.** Nothing in this package signs or submits anything. Submitting a proof needs a key and
  minutes of waiting for attestation, which is a worker's shape, not a library's.
- **The source-chain verifier.** Turning a transaction hash into a verified lock — fetch the
  receipt, check `status`, check the emitting address, decode `Lock_`, take `(blockNumber,
  transactionIndex)` from the receipt rather than from the event — currently lives with the
  application, at `../lib/precedence/adapters/sepolia/sepolia-reader.ts`, because it needs the
  deployed vault's full ABI. It is the next thing worth extracting, and it is named here rather
  than quietly omitted.
- **Ordering as authenticity.** This proves the *order* in which claims were financed. It cannot
  detect a custodian issuing two receipts for one pallet of copper. What it stops is the same
  registered claim being financed twice, or out of order.

## Layout

```
src/types.ts        the protocol's data model — collateral, races, locks, claims, proofs
src/hash.ts         canonical keccak256 hashing; the document hash a facility is identified by
src/attestcoin.ts   the 0x0FD3 ChainInfo client and the frontier arithmetic
src/domain/lock.ts       compareProvenOrder, settlePriorityLocks, the gate's invariants
src/domain/waterfall.ts  strict-seniority payout
src/domain/proof.ts      protocol constants, batch limits, measured latency, the dApp-side checks
src/domain/collateral.ts haircut arithmetic and the terms validation the contract mirrors
src/domain/policy.ts     deterministic financier policy
src/domain/ratify.ts     the seam a model's output must pass
src/domain/refinance.ts  refinance arbitrage and the atomic replacement record
src/domain/distress.ts   the deterministic unwind: freeze, coverage, grace, auction, default
```

## A note on where this directory lives

It sits inside `precedence/` rather than beside it, and that is Turbopack's requirement rather than
a preference: a path alias that resolves above the Next project root is refused outright. The
documented escape is `turbopack.root`, which also widens filesystem *watching* to the entire
repository — and this repository holds a second application checkout, the evidence archive and
build output, on a machine where the dev server already costs 3.2 GB. Keeping the package inside
the root is cheaper than widening the root.

The app consumes it through a `tsconfig` path mapping rather than a `file:` dependency, because Bun
*copies* a `file:` dependency into `node_modules` — an edit to the SDK would not be visible until
the next install. The mapping keeps one live source.

## Licence

MIT. See `../../LICENSE`.
