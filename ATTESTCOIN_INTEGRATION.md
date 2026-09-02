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

> **A correction we made and want to be transparent about.** Our own earlier research concluded
> there was *no* on-chain batch verify and that the spec's "one call settles the priority stack" was
> wrong. That was mistaken. We pinned `@gluwa/usc-contracts@0.2.0`, read the interface, and probed
> the deployed precompile: calling the batch selector reverts with `"Continuity chain cannot be
> empty"` — a validation error raised *from inside the implementation*, which is only reachable if
> the selector decoded and ran. The batch path exists and is what we use.

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

Attestcoin does **not** document attestation latency anywhere. Our own spec originally asserted
"~8–10 minutes" with no source, so we measured it instead and left the sampler running.

| | |
| --- | --- |
| min | **6.7 min** |
| p50 | **7.8 min** |
| p90 | **8.8 min** |
| max | **9.4 min** (n=86) |

Attestation advances in **batches**, so the lag is a **sawtooth**, not a constant — which is why we
quote a range and never a single number. Raw samples: `evidence/latency.jsonl`
(`ops/measure-latency.ts --summary`).

**What "one block" does and does not mean.** The complete flow is:

| Stage | Cost |
| --- | --- |
| 1. lock lands on Sepolia | instant |
| 2. attestation reaches that height | **6.7–9.4 minutes** |
| 3. proof generation | seconds |
| 4. verification at `0x0FD2` + state transition | **one Creditcoin block, ~15s** |

**"One block" refers only to stages 3–4.** Finality is minutes; settlement is one block. The UI
renders stage 2 as a patient `PENDING_EVIDENCE` state with a truthful elapsed timer, never a spinner
implying imminence.

For a demo, pre-stage source transactions **at least 12 minutes ahead** (p90 + 3 min buffer).

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

## 8. What we do not claim

**Ordering is not authenticity.** PRECEDENCE prevents double-**financing** of a *registered* claim,
and settles which claim is senior. It **cannot** detect a custodian issuing two warehouse receipts
for one physical lot. Hash-uniqueness stops the same identifier being registered twice; it says
nothing about whether the paper corresponds to real coffee. Qingdao was forged duplicate
certificates, and this protocol would not have caught that.

**Writability is out of scope.** Readability only — Creditcoin proves facts about Sepolia, not the
reverse. Every design decision follows from that: the vault never waits to be told who won, it
applies the same deterministic rule Creditcoin applies, so both chains agree on the allocated set
with no message between them.

**A Foundry fork cannot test the precompile.** `0x0FD2` is a Substrate *runtime* precompile with no
EVM bytecode; a fork fetches empty code and executes the call against a plain account. Our first
fork assertions "passed" for entirely unrelated reasons. All live precompile evidence therefore
comes from direct RPC (`ops/verify-precompile.ts`), and the fork test asserts only what a fork
honestly can.

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
