# Attestcoin — verified facts, and corrections to `rohan-plan.md`

Verified on **2026-09-01** directly against `docs.attestcoin.org` and the official
`gluwa/attestcoin-protocol-examples` repository. Every line below is quoted or derived from a
primary source, not from prior research or recollection.

**`rohan-plan.md` contains several API details that are wrong.** They read plausibly and would
compile in a person's head, which is exactly why they would have cost days. Corrections are in §2.

---

## 0. AMENDED 2026-09-01 (later pass) — read this before §1–§8

The sections below were written from the docs and the `gluwa/attestcoin-protocol-examples` repo. A
later pass **pinned the published packages** (`@gluwa/usc-sdk@0.18.0`, `@gluwa/usc-contracts@0.2.0`),
read their actual Solidity and `.d.ts`, and **probed the deployed CC3 testnet precompiles**. Five
claims below are wrong. Corrections here win; full write-up in `IMPLEMENTATION_PLAN.md` §1.

| Claim below | Correction |
| --- | --- |
| §2.2 "there is **no** on-chain batch verify"; "the spec's *one call settles the priority stack* does not hold" | **WRONG. There is.** `INativeQueryVerifier` declares `verifyAndEmit` AND `verify` in *both* single and batch form (4 entry points). Verified live on the deployed `0x0FD2`: the batch selector executes and reverts with `"Continuity chain cannot be empty"` — a semantic error from inside the implementation, not a missing function. **`rohan-plan.md` §11/§15's original claim is true as deployed.** `AttestationGate` makes ONE batch call, not a loop. The view-only `verify` is a free off-chain preflight. |
| §4 / §SECURITY import path `@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol` | **WRONG path — will not resolve.** Actual: **`@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol`**. Everything in the package ships under `contracts/write-ability/**`, readability pieces included. |
| §2.2 "target ^0.8.23" | **WRONG.** Both `INativeQueryVerifier.sol` and `EvmV1Decoder.sol` are **`pragma solidity ^0.8.28`**. `^0.8.23` will not compile against them. Package also pulls `@openzeppelin/contracts@5.1.0`. |
| §4 `decodeReceiptFields(...).status`, `getLogsByEventSignature(encodedTx, SIG)` | **WRONG shapes.** Field is **`.receiptStatus`**. `getLogsByEventSignature` takes the **decoded `ReceiptFields`**, not raw bytes. Confirmed good: **`LogEntry.address_` exists**, so the §SECURITY vault-binding control is implementable as written. |
| §2.1 "the `prover.cc3-testnet…` host does not exist" | **WRONG.** Both `prover.` and `proof-gen-api.` return 200. Still use **`proof-gen-api.`** — it is canonical and its `GET /api/v1/proof-by-tx/{chainKey}/{txHash}` returns well-formed errors. |
| §2.3 "`getSupportedChains()` — only this method" | Understated. `PrecompileChainInfoProvider` has 8 methods incl. `getLatestAttestedHeightAndHash`, `getContinuityBounds`, `isHeightAttested`. Constructor takes an **ethers provider**, not a URL. `ProofBuilder` is **`new ProofBuilder(chainKey, builderUrl, timeout?)`**. |

### The three items §5/§7 left unmeasured are now CLOSED

- **Attestation latency — MEASURED.** Three samples of `0x0FD3.get_latest_attestation_height_and_hash(1)`
  vs live Sepolia head, 2026-09-01 14:14–14:16Z: **34 / 38 / 42 blocks behind = 7.21 / 7.94 / 8.68
  minutes.** Attestation advances in **batches**, so the lag is a **sawtooth between ~7 and ~9
  minutes**, not a constant. `rohan-plan.md` §20's ~8–10 min estimate holds up. Honest phrasing:
  **"7–9 minutes, measured 2026-09-01."** A 24-hour distribution is being logged before this is
  quoted publicly.
- **CC3 block gas limit — MEASURED: 75,000,000** (block time exactly 15.0s, gasPrice 0.5 gwei). Ten
  verifications fit with vast headroom. Moot anyway now that the batch call exists.
- **SDK versions — PINNED:** `@gluwa/usc-sdk@0.18.0`, `@gluwa/usc-contracts@0.2.0`.

### Also verified live, and one thing that is broken in our own code

- Sepolia = **chainKey 1** (chainId 11155111) and Ethereum mainnet = **chainKey 3**, read from
  `0x0FD3.get_supported_chains()` itself. CC3 chainId **102031**.
- **`calculateTxIndex` is live and callable** on the deployed precompile — the same-block tie-break
  is safe.
- `getBatchProof` returns `merkleProofs` as **`Map<height, Map<txIndex, {txHash, txBytes, merkleProof}>>`**,
  so the source `txIndex` is available **off-chain** too. Two independent ordering witnesses.
- **`https://explorer.cc3-testnet.creditcoin.network` DOES NOT RESOLVE.** It is in
  `precedence/.env.example`, `mock-creditcoin-client.ts:13` and `steps.ts:349` — so every explorer
  link the app renders is dead, which is exactly non-negotiable #1. Live CC3 explorer:
  **`https://creditcoin-testnet.blockscout.com`**. Substrate view: `https://creditcoin3-testnet.subscan.io/`.

---

## 1. Confirmed correct

| Fact | Value | Source |
| --- | --- | --- |
| Ethereum Sepolia supported on testnet | **chainKey `1`** | chains-environments |
| Ethereum Mainnet on testnet config | chainKey `3` (note: `1` on mainnet) | chains-environments |
| BlockProver precompile | `0x0000000000000000000000000000000000000FD2` | chains-environments + `VerifierInterface.sol` |
| ChainInfo precompile | `0x0000000000000000000000000000000000000fd3` | chains-environments |
| Decoder contract (testnet) | `0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f` | chains-environments |
| Batch limits | `MAX_BATCH_SIZE` = **10 proofs**, `MAX_BATCH_RANGE` = **1000 blocks** | SDK page |
| SDK peer dep | **ethers v6** | SDK page |
| dApp must check receipt status | ASC example asserts `status == 1` itself | `ASCMinter.sol` |

---

## 2. Corrections — `rohan-plan.md` is wrong on these

### 2.1 The proof service URL is wrong (silent failure)

- Spec says: `https://prover.cc3-testnet.creditcoin.network`
- **Actual: `https://proof-gen-api.cc3-testnet.creditcoin.network/`** (both hosts resolve — see §0)
- Also available: ASC dashboard `https://dashboard.cc3-testnet.creditcoin.network/`

### 2.2 The on-chain interface is not `verifySingle` / `verifyBatch`

`contracts/sol/VerifierInterface.sol` (Solidity **^0.8.23**, MIT):

```solidity
interface INativeQueryVerifier {
    struct MerkleProofEntry { /* hash, isLeft */ }
    struct MerkleProof      { /* root, siblings[] */ }
    struct ContinuityProof  { /* lowerEndpointDigest, roots[] */ }

    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);

    function calculateTxIndex(MerkleProof calldata merkle_proof) external view returns (uint64);
}

library NativeQueryVerifierLib {
    address constant PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000FD2;
    function getVerifier() internal pure returns (INativeQueryVerifier);
}
```

Differences from the spec's `AttestationGate.sol`:
- the function is **`verifyAndEmit`**, not `verifySingle`; it is **non-view** (it emits)
- `chainKey` and `height` are **`uint64`**, not `uint256`
- proofs are **structs**, not `bytes calldata`
- ~~there is **no on-chain `verifyBatch`**~~ — **RETRACTED, see §0: an on-chain batch overload of `verifyAndEmit` EXISTS and is deployed.** The original text follows for history: batching is an *off-chain/SDK* concept — on-chain you
  call `verifyAndEmit` once per transaction. The spec's claim in §11/§15 that one on-chain
  `verifyBatch()` call settles the whole priority stack **does not hold.** The real batch saving is
  in proof *generation* and shared continuity data via `getBatchProof`, not in a single call.
- use `NativeQueryVerifierLib.getVerifier()` rather than hand-rolling the address
- target **^0.8.28** (see §0 — ^0.8.23 in the original text was wrong), not ^0.8.20

### 2.3 SDK method signatures differ

```
ProofBuilder.waitUntilHeightAttested(chainKey: number, blockNumber: number): Promise<void>   ✓ matches
ProofBuilder.getProof(txHash: string): Promise<ProofResult>                    ← takes a TX HASH
ProofBuilder.getBatchProof(txHashes: string[]): Promise<BatchProofResult>      ← array of TX HASHES
RawProofBuilder.getProof(txHash: string)
PrecompileChainInfoProvider.getSupportedChains(): Promise<ChainInfo[]>         ← only this method
PrecompileBlockProver.verifySingle(chainKey, headerNumber, txBytes, merkleProof, continuityProof)
PrecompileBlockProver.verifyBatch(chainKey, headers: number[], txBytesArr, merkleProofs, continuityProof)
```

The spec's `worker.ts` calls `getProof(chainKey, blockNumber, txIndex)` and
`getBatchProof(chainKey, [{blockNumber, txIndex}])`. **Both signatures are wrong** — they take
transaction hashes.

Note `verifyBatch` takes **`headers: number[]`** — an array, one per transaction. The spec assumed
a single shared `blockHeight`, which would have broken a race spanning multiple blocks. The array
form is *better* for us: a priority race naturally spans blocks.

`PrecompileBlockProver` is the **off-chain** verifier (async, returns `Promise<boolean>`). The
on-chain path is `INativeQueryVerifier`. Do not confuse them.

---

## 3. The blocking question is resolved — favourably

**Is transaction index available on-chain?** It was the one unknown that could have forced a
redesign, because same-block locks are likely on Sepolia's ~12s blocks and a raw RLP transaction
does not contain its own block position.

**Yes.** `INativeQueryVerifier.calculateTxIndex(MerkleProof) returns (uint64)` derives the index
from the Merkle proof path (the Ethereum transactions trie is keyed by encoded tx index).

So PRECEDENCE's priority rule — order by proven **`(height, calculateTxIndex(merkleProof))`** — is
directly implementable against the sanctioned interface, including same-block ties. This is a
purpose-built function most submissions will never touch, and "depth of Attestcoin utilization" is
an explicit core scoring criterion. **Use it, and say so in the integration summary.**

Belt-and-braces option worth considering anyway: have `PriorityVault.lock()` keep its own monotonic
`seq` counter and emit it. It costs one SSTORE, is provable through ordinary log decoding, and gives
a second independent ordering witness if `calculateTxIndex` ever behaves unexpectedly.

---

## 4. The sanctioned data-extraction pattern is EVENT LOGS, not calldata

`ASCMinter.sol` uses the `EvmV1Decoder` library:

```solidity
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol"; // CORRECTED, see §0
```

`getLogsByEventSignature(receipt, SIG)` returns `EvmV1Decoder.LogEntry[]`, and each entry exposes
**`address_`** (the emitting contract), **`topics`** and **`data`**. Methods used:

- `getTransactionType()` / `isValidTransactionType()`
- `decodeReceiptFields()` — **this is how you enforce `status == 1`**
- `getLogsByEventSignature()` — locate the event, then read its data

It reads values **out of event logs**, and does **not** decode the `to` address, block number or
transaction index from calldata.

Design consequences for PRECEDENCE:

1. **Do not hand-roll an RLP calldata parser.** Emit everything needed in the `Lock` event on
   Sepolia and read it with `getLogsByEventSignature`.
2. The event should carry: `collateralId`, `financier`, `tranche`, `amount`, `block.number`, and
   the `seq` counter from §3.
3. Binding a proof to the right vault: match **`log.address_`** against
   `collateralRegistry.vaultOf(collateralId)`. Confirmed available; `ASCMinter` uses the same field
   as its trust anchor. This check is mandatory — see `DECISIONS.md`.
4. Enforce `status == 1` yourself via `decodeReceiptFields()`. The precompile does not do it.

---

## 5. Not documented — must be measured, not assumed

- **Attestation latency is nowhere in the docs.** `step-1-attestation` says only that attestors
  summarise blocks "periodically", with no figure. The ~8–10 minute number in `rohan-plan.md` §20
  is an unsourced measurement. **Measure it on CC3 testnet before designing the demo**, and record
  the real number with the timestamps that produced it.
- Gas cost of `verifyAndEmit` — see the gas-costs doc page; budget before choosing batch vs single.
- The exact `@gluwa/usc-sdk` version — pin whatever `npm view @gluwa/usc-sdk version` returns and
  re-verify these signatures against the installed package before writing code.
- ~~The `EvmV1Decoder` package name~~ — **ANSWERED: `@gluwa/usc-contracts`**
  (`contracts/decoding/EvmV1Decoder.sol`). Pin the version.

### Gas, verified

`≈ 2.3e-5 + 2.9e-7 × (continuity hash count)` CTC. A 10-minute-old tx: **2.59e-5 CTC**. The same tx
at 24 hours: **3.13e-4 CTC** — 10× more, as continuity hashes grow 10 → 1000. **Prove promptly.**
One maximal decode is **0.0375 CTC**, which dominates everything else, so decode only the single
`Lock` event you need rather than all logs. Block gas limit is referenced but never published.

---

## 6. Use the official example — do not invent

`github.com/gluwa/attestcoin-protocol-examples` contains a working end-to-end **lending** flow,
which is close to PRECEDENCE's shape:

- `contracts/sol/` — `ASCBase.sol`, `ASCLoanManager.sol`, `AuxiliaryLoanContract.sol`,
  `LoanTypes.sol`, `VerifierInterface.sol` (+ ABIs in `contracts/abi/`)
- `loan-flow/` — `register.ts`, `register_source_contract.ts`, `authorize.ts`, `fund_loan.ts`,
  `repay_loan.ts`, `inspect.ts`, **`worker.ts`**
- `bridge-offchain-worker/worker.ts`, `hello-bridge/submit_query.ts`, `utils/`

**Read `ASCBase.sol` and `loan-flow/worker.ts` before writing a line of our own.** `ASCBase` is
almost certainly the base class our `AttestationGate` should extend, and `register_source_contract`
suggests source contracts must be **registered** with the ASC — a step absent from `rohan-plan.md`
entirely, and a likely source of "why does verification fail" if missed.

---

## 7. Open items for the implementer

1. ~~Confirm whether an ASC must register its source contract~~ — **ANSWERED: no.** `ASCBase.sol`
   has no registration mapping, function or modifier. Proofs verify without pre-registration.
2. Confirm `getLogsByEventSignature` exposes the emitting log's `address` (see §4.3). **This is now
   a build-stopping security requirement, not a nicety** — see below.
3. Find and pin the `EvmV1Decoder` package.
4. Measure real attestation latency (§5) and update `rohan-plan.md` §20 with the measured figure.
5. Decide batch vs per-lock verification once gas costs are known — and fix the §11/§15 claim so it
   matches reality before it reaches a judge.


---

## 8. `ASCBase.sol` — the reference pattern, and its one gap

The canonical ASC base contract:

- calls `VERIFIER.verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof)`
- derives `txIndex` from the merkle proof and builds `queryId = keccak256(chainKey, blockHeight, txIndex)`
- blocks replay with `require(!processedQueries[queryId], "Query already processed")`, setting it
  after success

Two things follow.

**Good news:** `calculateTxIndex` is used by the reference implementation itself, so our ordering
rule is idiomatic rather than exotic. And the replay pattern is settled — reuse `queryId` rather
than inventing a nullifier scheme.

**The gap — and it is a security hole if copied naively:** `ASCBase` **does not record or validate
which contract emitted the verified transaction.** No source address appears in `queryId` or in
stored state. A proof of a `Lock` event from an attacker's look-alike contract is a *genuine* proof
and would verify.

`AttestationGate` must therefore bind each proof to the registered vault for that collateral —
match the emitting log's `address` against `collateralRegistry.vaultOf(collateralId)`, or have the
vault emit `address(this)` in the event and check that. See `DECISIONS.md` for the full write-up.
