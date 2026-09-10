# PRECEDENCE — Attestcoin integration summary

**BUIDL CTC 2026 Fall · RWA track**

> Competing financiers race to lock capital against real-world collateral on Ethereum Sepolia. The
> Attestcoin Native Query Verifier precompile at `0x0FD2` on Creditcoin CC3 proves each lock **and
> its canonical source-block position**, so lien priority settles by proven cryptographic ordering
> rather than by legal filing.

---

## 1. The one-sentence argument

An oracle can *assert* which lock came first. It cannot *cryptographically commit* to that ordering
— and without ordering, priority collapses.

That is the whole reason this protocol needs Attestcoin rather than a bridge, a multisig, or a
price feed. Priority is not a fact about a balance; it is a fact about **where a transaction sat
inside a block on another chain**. Attestcoin is the only mechanism we found that can prove that
synchronously, on-chain, without trusting a committee.

---

## 2. The claim, measured

Sepolia produces ~12-second blocks, so two financiers racing for the same collateral will
frequently land **in the same block**. A block height cannot order them. `calculateTxIndex` can.

We verified this against the **live precompile** with real Sepolia transactions:

| Transaction | `calculateTxIndex` at `0x0FD2` | Block explorer | Agrees |
| --- | --- | --- | --- |
| `0x144bc395f407…` | **102** | 102 | yes |
| `0xc58e9177d4de…` | **131** | 131 | yes |
| `0xf2b901f98983…` | **163** | 163 | yes |

Given **nothing but a Merkle path**, the precompile derives the canonical transaction position, and
it matches what the chain independently reports. This is the protocol's entire thesis reduced to one
comparison a sceptic can re-run. Raw record: `evidence/proof-path-probe.json`.

`PrecompileBlockProver.verifyBatch` returned `true` for the same proof material, at a cost of
**3.81e-5 CTC**.

---

## 3. Six load-bearing uses of the protocol

Not decoration — remove any one and something breaks.

### 3.1 `calculateTxIndex` for same-block priority

`INativeQueryVerifier.calculateTxIndex(MerkleProof) → uint64` derives the intra-block index from
the proof path. **Remove it and the protocol has no mechanism**, because the common case — two locks
in one block — becomes unorderable.

We also learned its semantics empirically: a path of `[isLeft: true, false, true]` derives index
**5** (`0b101`). The sibling-direction bits *are* the transaction index in binary.

```solidity
// AttestationGate.sol
uint64 txIndex = verifier().calculateTxIndex(merkleProof);
```

### 3.2 The on-chain **batch** `verifyAndEmit`

`INativeQueryVerifier` exposes a batch overload taking `uint64[] heights` and **one shared
`ContinuityProof`**. An entire priority race settles in a single call — atomic *by construction*
rather than atomic because we wrapped N calls in a transaction. There is no window in which half a
race is settled.

```solidity
verifier().verifyAndEmit(SEPOLIA_CHAIN_KEY, proof.heights, proof.encodedTxs,
                         proof.merkleProofs, proof.sharedProof);
```

> **Verified against the deployed precompile, not against documentation.** The batch path is easy
> to assume absent, because the published interface listing does not make the overload obvious. So
> we pinned `@gluwa/usc-contracts@0.2.0`, read the interface source, and probed `0x0FD2` directly:
> calling the batch selector reverts with `"Continuity chain cannot be empty"` — a validation error
> raised *from inside the implementation*, which is only reachable if the selector decoded and ran.
> That is proof the batch entry point exists on the deployed precompile, and it is the one we use.

### 3.3 Ordering is **verified on-chain**, not trusted from the prover

The gate re-derives every `txIndex` from its Merkle proof and requires the sequence to strictly
increase. A prover cannot present the race in a self-serving order.

This is the difference between *sorting an array someone handed us* and *priority being a proven
fact*. It is enforced, and the enforcement has a test that fails if it is removed.

### 3.4 The vault-binding control the reference pattern omits

`ASCBase` computes its replay key as `keccak256(chainKey, height, txIndex)` and **never records
which contract emitted the verified transaction.**

That is a real hole. An attacker deploys a look-alike contract on Sepolia, emits an identical `Lock`
event for free, obtains a **genuine** Attestcoin proof, and submits it. The proof verifies, because
the proof *is* real — it just proves an event from the wrong contract. The attacker takes senior
priority against collateral they never funded.

`EvmV1Decoder.LogEntry` exposes `address_`, so we bind every proof to the registered vault:

```solidity
require(lock.emittedBy == registry.vaultOf(collateralId), "wrong vault");
```

`test_revert_genuineProofOfLookalikeContractIsRejected` is the passing test for it.

### 3.5 The free view-only `verify` as a preflight

The same interface exposes non-mutating `verify`. The worker checks every batch through it for
**zero gas** before paying to submit, so a malformed proof costs nothing instead of a failed
transaction plus a confusing revert inside proof verification.

### 3.6 `status == 0x1`, which the precompile does not check

The precompile proves **inclusion**, not success. A reverted lock is a genuinely included
transaction. Without this check a financier could deliberately revert their lock — escrowing nothing
— and still hold a valid inclusion proof for senior priority.

```solidity
EvmV1Decoder.ReceiptFields memory r = EvmV1Decoder.decodeReceiptFields(encodedTx);
require(r.receiptStatus == 1, "reverted tx");
```

---

## 4. Completeness: the attack nobody warned us about

Ordering alone is not enough. A prover who submits a *subset* of the race can promote a friend by
simply leaving out the lock that beat them.

`PriorityVault` therefore stamps each lock with a per-race `seq`, and `openRace()` resets the counter
so every race is numbered from 1. The gate requires `seq` **contiguous from 1**, all sharing one
`raceNonce`:

| Omission | Caught by |
| --- | --- |
| a **middle** lock | leaves a gap in `seq` |
| the **first** lock — the senior winner, the attack that actually pays | leaves a consecutive run, so contiguity alone would miss it; the **start-at-1** requirement catches it |
| **tail** truncation | passes, and is self-defeating: it only drops later, more-junior locks, whose holders can submit their own proof |

`seq` is also a consistency witness. It is the vault's *claim*; `(height, txIndex)` is a *proof*.
They are produced independently, so if they disagree the vault is misreporting its own ordering and
the gate rejects the submission.

---

## 5. Honest timing — measured, not asserted

Attestcoin does **not** document attestation latency anywhere, and our own first estimate had no
source behind it. So we measured it and left the sampler running. Both the raw stream and the
distribution it produces are committed: `evidence/latency.jsonl` and `evidence/latency-summary.json`.

| | |
| --- | --- |
| samples | **345**, sampled every 60s over a 24-hour window |
| min · p50 · p90 · p99 · max | **6.54 · 7.75 · 8.73 · 9.02 · 9.35 min** |
| quoted as | **6.5–9.3 min** — the same distribution, rounded for display |

Attestation advances in **ten-block batches**, so the lag is a **sawtooth** rather than a constant
— which is why we quote a range and never a mean. Recount it yourself with
`bun run ops/measure-latency.ts --summary`.

**What "one block" does and does not mean.** The complete flow is:

| Stage | Cost |
| --- | --- |
| 1. lock lands on Sepolia | instant |
| 2. attestation reaches that height | **6.5–9.3 minutes** |
| 3. proof generation | seconds |
| 4. verification at `0x0FD2` + state transition | **one Creditcoin block, ~15s** |

**"One block" refers only to stages 3–4.** Finality is minutes; settlement is one block. The UI
renders stage 2 as a patient `PENDING_EVIDENCE` state with a truthful elapsed timer, never a spinner
implying imminence.

For a demo, pre-stage source transactions **at least 12 minutes ahead** (p90 + 3 min buffer).

### Why it is that long — the mechanism, observed directly

The continuous sampler measures an *indirect* proxy — how old the newest attested block is. So a
second experiment measures the question that actually matters: **a lock lands now; how long until
it is provable?**

`ops/latency-experiment.ts` watches one specific fresh block and times three independent signals:

| Block | `is_height_attested` | `get_attestation_bounds` | frontier reaches height |
| --- | --- | --- | --- |
| 11,619,853 | **8.14 min** | 8.14 min | 8.14 min |
| 11,619,919 | **6.95 min** | 6.95 min | 6.95 min |

All three flip at the same instant in both samples, which also confirms the indirect proxy was
measuring the right thing after all.

**The mechanism, observed directly.** The attestation frontier runs ~30–40 Sepolia blocks behind
head and advances in **batches of exactly 10 blocks, roughly every 2 minutes**:

```
t+0.0min  frontier 11619820   (target 11619853, 33 blocks ahead)
t+2.2min  frontier 11619830   +10
t+4.1min  frontier 11619840   +10
t+6.1min  frontier 11619850   +10
t+8.1min  attested ✓
```

Sepolia produces 10 blocks in 2 minutes, so attestation *keeps pace but never closes the gap*. Being
~33 blocks behind is a **~6.6 minute structural floor** (33 × 12s), plus alignment to the next batch.

This is the Attestcoin network's own cadence, not our implementation. Nothing on our side makes it
faster — which is exactly why the honest two-stage story matters, and why the demo pre-stages source
transactions ≥12 minutes ahead rather than pretending the wait away.

---

---

## 6. Cost, and why the worker proves promptly

Verification cost grows with proof **age**, because continuity hashes accumulate:

```
≈ 2.3e-5 + 2.9e-7 × (continuity hash count)  CTC
```

A ~10-minute-old transaction costs ~2.6e-5 CTC; the same one at 24 hours costs ~3.1e-4 CTC — **over
10× more**. So the worker proves as soon as attestation allows rather than batching work up. Our
measured probe on a ~1-hour-old batch (52 continuity roots) cost **3.81e-5 CTC**.

Decoding dominates everything else (~0.0375 CTC for a maximal workload), so the gate fetches exactly
**one** `Lock` event by signature rather than walking every log.

Measured on-chain, on a live CC3 fork:

| | |
| --- | --- |
| `settlePriority` (3 locks) | **654,431 gas** — 0.87% of a block |
| CC3 block gas limit | **75,000,000** |
| CC3 base fee | **0.5 gwei** |

---

## 7. Where the integration code lives

| Path | Role |
| --- | --- |
| `contracts/src/creditcoin/AttestationGate.sol` | the integration core — batch `verifyAndEmit`, `calculateTxIndex`, decode, vault binding, replay guard |
| `contracts/src/creditcoin/PriorityProofLib.sol` | every check the precompile does *not* do, as a pure library so each is exhaustively testable |
| `contracts/src/sepolia/PriorityVault.sol` | the source-chain contract; emits the `Lock` event the gate decodes |
| `worker/src/proof.ts` | `waitUntilHeightAttested` → `getBatchProof` → flatten → preflight |
| `worker/src/probe-proof.ts` | the end-to-end probe in §2, runnable with nothing deployed |
| `ops/verify-precompile.ts` | 10 live-chain checks → `evidence/precompile.json` |

### SDK surface used

`@gluwa/usc-sdk@0.18.0`, `@gluwa/usc-contracts@0.2.0`, Solidity **^0.8.28**.

```
PrecompileChainInfoProvider(ethersProvider)   // 0x0FD3
  .getSupportedChains()                       // Sepolia is chainKey 1, per the chain itself
  .getLatestAttestedHeightAndHash(1)          // the honest lag
  .waitUntilHeightAttested(1, height)
ProofBuilder(chainKey, builderUrl)            // NOT a wrapped ChainInfo provider
  .getBatchProof(txHashes)                    // takes HASHES; ≤10 txs; 1000-block window
PrecompileBlockProver(provider).verifyBatch(…) // off-chain verification
```

---

## 8. Scope, and one methodological note

**Proven ordering, deliberately scoped to ordering.** PRECEDENCE proves which claim is senior and
prevents the same registered claim being financed twice or out of order. Whether a custodian issued
two receipts for one physical lot is a *document-authenticity* problem — solved by custody
attestation and inspection — and it composes with this rather than competing. We do the half that
is cryptographically provable, and hash-uniqueness makes the registered identifier itself
unforgeable. Keeping the two problems distinct is what lets the proof claim be strong enough to
settle capital on.

**Readability by design, and the architecture follows from it.** Creditcoin proves facts about
Sepolia; nothing flows back. That one constraint produces the system's best property: the vault
never waits to be told who won. It applies the same deterministic allocation rule Creditcoin
applies, so both chains agree on the allocated set with no message, no bridge and no relayer
between them.

**A Foundry fork cannot test a runtime precompile, so we do not pretend otherwise.** `0x0FD2` is a
Substrate runtime precompile with no EVM bytecode: a fork fetches empty code and runs the call
against a plain account, so assertions about it pass or fail for reasons unrelated to the
precompile. Every piece of live precompile evidence therefore comes from direct RPC
(`ops/verify-precompile.ts` → `evidence/precompile.json`), and the fork test asserts only what a
fork honestly can — that our own contracts deploy, wire and settle under real chain conditions.

---

## 9. Reproduce it

```bash
# 10 live-chain checks against both precompiles
bun run ops/verify-precompile.ts

# the full proof path against real Sepolia transactions — needs nothing deployed
cd worker && bun run src/cli.ts probe \
  0x144bc395f407d98d722e780d805786125e07283e141006c6c9bfafa64c5f6f78 \
  0xc58e9177d4dea9a25dc205d80e458da11efb56635f73900e2ae413ad699f77cf \
  0xf2b901f9898354cfbb01af86150105eceb1cc04d93a5365066f12fd3a6b6bd09

# the security controls, one passing rejection per attack
cd contracts && make test
```
