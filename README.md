# PRECEDENCE

**Lien priority settled by proven source-block position, not by filing order.**

*BUIDL CTC 2026 Fall · Creditcoin × Attestcoin · RWA track*

Competing financiers lock capital against real-world collateral on **Ethereum Sepolia**. The
Attestcoin Native Query Verifier precompile at **`0x0FD2`** on **Creditcoin CC3** proves each lock
**and its canonical position inside its source block**, so seniority settles by cryptographic
proof rather than by whose paperwork reached a registry first. The winning claim mints as a
tradeable ERC-1155 position, outpaced capital auto-refunds in full, and the encumbrance registry
populates itself as a by-product of financing.

**Why a proof and not an oracle:** an oracle can *assert* which lock came first. It cannot
*cryptographically commit* to that ordering. Without committed ordering, priority collapses — and
priority is the entire structure of secured lending.

---

## Status at a glance

| | |
| --- | --- |
| **Deployed** | Ethereum Sepolia (chainId `11155111`) **and** Creditcoin CC3 (chainId `102031`) — 7 contracts, addresses in [§8](#8-deployed-contracts) |
| **Live app** | [precedence-beige.vercel.app](https://precedence-beige.vercel.app) — frontend on Vercel, API on Azure |
| **Live self-report** | [`/api/config`](https://precedence-beige.vercel.app/api/config) returns `"mode": "chain"` with both adapters `live: true` |
| **Attestcoin surface used** | `0x0FD2` batch `verifyAndEmit` · `calculateTxIndex` · view-only `verify` preflight · `0x0FD3` `get_supported_chains` / `get_latest_attestation_height_and_hash` / `is_height_attested` |
| **Headline proof** | four locks — **two of them in the same Sepolia block** — settled in **one** Creditcoin transaction, precompile-derived index cross-checked against the explorer ([§6](#6-proven-on-chain-the-same-block-settlement)) |
| **Measured attestation latency** | **6.5–9.3 min**, 345 samples, p50 7.8 · p90 8.7 · p99 9.0 ([§7](#7-honest-timing-measured-not-asserted)) |
| **Tests** | **1,113** requiring no network + 4 fork tests + 10 live-chain precompile checks ([§10](#10-testing)) |
| **Evidence** | 5 settled races, a live precompile report, and 456 timing samples across 3 datasets — all machine-written to `evidence/` ([§9](#9-evidence-index)) |
| **Scale** | ~37,600 hand-written lines: 2,331 Solidity + 2,124 Solidity tests + 2,305 worker + 20,725 app/SDK + 9,053 app/SDK tests + 1,103 ops |
| **Licence** | MIT |

---

## Contents

1. [What this is, in thirty seconds](#1-what-this-is-in-thirty-seconds)
2. [Verify this submission in five minutes](#2-verify-this-submission-in-five-minutes)
3. [The problem, and why 2025 made it urgent](#3-the-problem-and-why-2025-made-it-urgent)
4. [How it works](#4-how-it-works)
5. [Depth of Attestcoin utilisation](#5-depth-of-attestcoin-utilisation)
6. [Proven on chain: the same-block settlement](#6-proven-on-chain-the-same-block-settlement)
7. [Honest timing, measured not asserted](#7-honest-timing-measured-not-asserted)
8. [Deployed contracts](#8-deployed-contracts)
9. [Evidence index](#9-evidence-index)
10. [Testing](#10-testing)
11. [Architecture and repository layout](#11-architecture-and-repository-layout)
12. [`mock | chain` — the honesty mechanism](#12-mock--chain--the-honesty-mechanism)
13. [Scope — what the protocol proves](#13-scope--what-the-protocol-proves)
14. [Provenance and originality](#14-provenance-and-originality)
15. [Run it yourself](#15-run-it-yourself)

---

## 1. What this is, in thirty seconds

Two lenders finance the same warehouse receipt ninety seconds apart. One of them is **senior** — if
the borrower defaults, they are paid back first, and because their risk is lower they lend at a
cheaper rate. Who gets that position?

Today: whoever's paperwork reaches the registry first, which can be days after the money moved.

PRECEDENCE: whichever transaction actually landed first on the source chain, proven
cryptographically. A lock's priority *is* its `(blockHeight, txIndex)`.

The hard part is `txIndex`. Sepolia's ~12-second blocks make two locks in one block likely, and a
block height cannot separate them. `INativeQueryVerifier.calculateTxIndex` re-derives the
intra-block position **from the Merkle path itself**, on Creditcoin, at `0x0FD2` — so the tie-break
is a proof and not an assertion. Without that one function this protocol has no mechanism.

---

## 2. Verify this submission in five minutes

Nothing here needs our contracts, our keys, or our app. Each command writes a machine-checkable
record.

```bash
# ── 0. the live deployment reports its own provenance (no install needed)
curl -s https://precedence-beige.vercel.app/api/config | python3 -m json.tool
#    expect: "mode": "chain", sepolia.live true, creditcoin.live true, and the addresses in §8

# ── 1. ten checks against BOTH live precompiles → evidence/precompile.json
bun run ops/verify-precompile.ts
#    proves: 0x0FD2 and 0x0FD3 are callable, Sepolia is chainKey 1 (read from the chain itself),
#    attestation genuinely LAGS the source chain, and calculateTxIndex derives an index from a path

# ── 2. the whole proof path against three real, pre-existing Sepolia transactions
#       — runs with NOTHING of ours deployed, so it isolates the protocol from our code
cd worker && bun install && bun run src/cli.ts probe \
  0x144bc395f407d98d722e780d805786125e07283e141006c6c9bfafa64c5f6f78 \
  0xc58e9177d4dea9a25dc205d80e458da11efb56635f73900e2ae413ad699f77cf \
  0xf2b901f9898354cfbb01af86150105eceb1cc04d93a5365066f12fd3a6b6bd09
#    → evidence/proof-path-probe.json

# ── 3. the security controls — one passing rejection per attack
cd ../contracts && make test        # 98 tests
cd ../worker && bun test            # 20 tests
cd ../precedence && bun install && bun test   # 995 tests

# ── 4. the pre-submission gate: every documented URL resolves, every 0x literal is real or SAMPLE
cd .. && bun run ops/check-submission.ts
```

**Read one file to judge the integration:**
[`contracts/src/creditcoin/AttestationGate.sol`](./contracts/src/creditcoin/AttestationGate.sol)
(342 lines). It is the integration core: the batch `verifyAndEmit` call, `calculateTxIndex`, the
receipt decode, the vault binding, and the replay guard.

**Read one file to judge the honesty:**
[`ATTESTCOIN_INTEGRATION.md`](./ATTESTCOIN_INTEGRATION.md) — the load-bearing uses of the protocol
one by one, each with the code that implements it, plus the measured latency and the gas figures.

---

## 3. The problem, and why 2025 made it urgent

Secured lending runs on **priority**: when collateral fails, who is paid first. The *invisible
encumbrance problem* destroys that structure, because lenders cannot see each other's claims
against the same asset.

This is not a historical curiosity:

- **Tricolor Holdings** filed Chapter 7 in September 2025 having pledged the same auto loans to
  roughly twenty lenders — about $1.4bn of real collateral against $2.2bn pledged, with roughly
  $500m of losses landing at JPMorgan, Fifth Third and Barclays.
- **First Brands Group** filed Chapter 11 two weeks later, after selling the same receivables to
  multiple lenders.

The industry's answer has been **detection**: hash-based duplicate-check registries a lender *may*
query before lending. That approach is real and it works — MonetaGo won distribution over SWIFT —
but it is advisory, opt-in and bank-shaped, and it did not stop either 2025 collapse.

PRECEDENCE is not another detection service. **The financing mechanism itself populates the
registry.** Using the system *is* joining it, and priority settles without anyone querying
anything. There is no cold-start problem, because the first financing creates the first record.

---

## 4. How it works

```
  ETHEREUM SEPOLIA (chainKey 1)                    CREDITCOIN CC3 (chainId 102031)
  ┌──────────────────────────┐                     ┌──────────────────────────────────┐
  │  PriorityVault.sol       │                     │  0x0FD2  Native Query Verifier   │
  │                          │                     │  0x0FD3  ChainInfo               │
  │  openRace()  ← resets    │                     ├──────────────────────────────────┤
  │  lock()      ← seq 1..N  │   ┌────────────┐    │  AttestationGate                 │
  │  draw()                  │──►│   worker   │───►│   ONE batch verifyAndEmit        │
  │  repay()                 │   │ getBatch-  │    │   calculateTxIndex → position    │
  │  refund()                │   │  Proof     │    │   status==1 · vault binding      │
  │                          │   └────────────┘    │   ordering · completeness        │
  │  settles in pUSD (6dp)   │                     │            ↓                     │
  └──────────────────────────┘                     │  PriorityEngine → ClaimToken     │
                                                   │  CollateralRegistry              │
                                                   │  RefinanceEngine                 │
                                                   └──────────────────────────────────┘
```

1. An obligor registers collateral on Creditcoin as a **hash-unique** record: the document hash is
   `keccak256` over canonical JSON of `{assetType, docIdentifier, custodian, obligor, faceValueUsd}`,
   so the same document cannot be registered twice under two identifiers.
2. Financiers **lock pUSD** on Sepolia against it, each declaring a tranche. Every lock is a real
   transaction at a real index in a real block, and the vault stamps a monotonic `seq`.
3. The worker waits for Attestcoin to attest the source block — **6.5–9.3 minutes, measured** —
   then builds **one shared continuity proof** for the whole race and preflights it for free.
4. `AttestationGate` settles the race in **one Creditcoin transaction**: a single batch
   `verifyAndEmit`, then the checks the precompile does not perform.
5. **Priority settles by proven `(blockHeight, txIndex)` ordering.** A declared tranche is a
   *preference*; proven ordering decides who wins it. Capital beyond a tranche's sizing is
   **auto-refunded in full, never silently demoted** — a financier who bid SENIOR did not consent
   to subordinate risk. Demotion exists, but only with that financier's explicit consent.
6. Repayment runs a **strict seniority waterfall**: rank 1 is satisfied completely before rank 2
   receives a cent, so first loss lands on the most subordinate holder. Default runs a
   **deterministic unwind** — freeze, coverage stabilisation, grace, Dutch auction, default — where
   every transition is a permissionless, timestamp-gated keeper poke, so lender protection does not
   depend on our uptime.

---

## 5. Depth of Attestcoin utilisation

The protocol is not referenced; it is load-bearing in seven distinct ways. Remove any one and
either the mechanism disappears or a real attack opens.

| # | Use | Why it is load-bearing | Code |
| --- | --- | --- | --- |
| 1 | **`calculateTxIndex(merkleProof)`** at `0x0FD2` | Sepolia's ~12s blocks make same-block locks likely, and height alone cannot order them. The index is derived **from the Merkle path**, so the tie-break is proven rather than asserted. Without this the protocol has no mechanism at all. | `AttestationGate.sol:195,249` |
| 2 | **Batch `verifyAndEmit`** (`uint64[]` + `bytes[]` + `MerkleProof[]` + one `ContinuityProof`) | An entire race settles in a **single** on-chain call with **one shared continuity proof**, not a loop of single verifications. This is the batch overload of `INativeQueryVerifier`, called on-chain. | `AttestationGate.sol:143` |
| 3 | **Ordering verified on-chain**, not trusted from the prover | The gate re-derives every index itself and requires strictly increasing `(height, txIndex)`. A prover cannot reorder a submission to promote a friend. | `PriorityProofLib.sol` |
| 4 | **Vault binding** — the control the reference pattern omits | `ASCBase` never records *which contract* emitted the verified transaction, so a genuine proof of a look-alike contract's identically-shaped `Lock` event would verify. Every proof is bound to the collateral's registered vault. | `PriorityProofLib.sol` |
| 5 | **`status == 0x1` enforced by the dApp** | The precompile verifies *inclusion*, not success. A reverted lock is a genuinely included transaction with a real block and index — it would win a rank for free. | `PriorityProofLib.sol` |
| 6 | **Completeness via vault `seq`** | The gate requires `seq` contiguous from 1, which makes omitting a *middle* lock impossible. Only tail truncation remains, and a truncated tail drops later — more junior — locks whose holders can prove their own. | `AttestationGate.sol` |
| 7 | **`0x0FD3` ChainInfo for the wait** | `get_supported_chains` confirms Sepolia is chainKey 1 *from the chain itself*; `get_latest_attestation_height_and_hash` and `is_height_attested` are how the app reports the remaining wait honestly instead of hiding it. | `precedence/sdk/src/attestcoin.ts` |

`0x0FD3` is a Substrate **runtime** precompile, so its methods are snake_case rather than the
Solidity convention. Calling `getLatestAttestationHeightAndHash` returns empty data that decodes as
zero — which reads as "never attested" and is the most misleading failure available. We name it
because it cost us time.

**SDK surface:** `@gluwa/usc-sdk@0.18.0`, `@gluwa/usc-contracts@0.2.0`, Solidity `^0.8.28`.
`via_ir = true` is required, not preferred: the batch signature exhausts the EVM stack in the legacy
pipeline and the contracts will not compile without it.

**Batch limits respected:** `MAX_BATCH_SIZE` 10 transactions, `MAX_BATCH_RANGE` 1000 blocks — both
checked before a proof is built, in `batchFits()`.

Full detail, including the attack nobody warned us about: **[`ATTESTCOIN_INTEGRATION.md`](./ATTESTCOIN_INTEGRATION.md)**.

---

## 6. Proven on chain: the same-block settlement

This is the case the whole design exists for, and it happened on testnet. Record:
[`evidence/race-88857090.json`](./evidence/race-88857090.json).

Four financiers locked against collateral
`0x88857090bc93b1a1de83c7f4838af8684ddd9d61d4e865d431f2e6df3641db3b`. **Two of the locks landed in
the same Sepolia block, 11626711** — so the block number cannot order them.

| Financier | Sepolia block | `txIndex` | Outcome |
| --- | --- | --- | --- |
| `0x537fC713…` | 11626711 | **71** | **SENIOR**, $5,100 |
| `0x8E83a933…` | 11626711 | **72** | **JUNIOR**, $2,550 |
| `0x4f3F6012…` | 11626712 | 58 | refunded in full |
| `0x78a5C38c…` | 11626713 | 64 | refunded in full |

Same block. Index 71 takes senior; index 72 takes junior. Nobody decided that — the precompile
derived it. The full allocation, including a partial fill that spans two tranches and refunds the
remainder, is in the record.

| | |
| --- | --- |
| Attestation wait | **6.37 minutes** |
| Settled on Creditcoin | tx [`0x1a61728c7fa2…`](https://creditcoin-testnet.blockscout.com/tx/0x1a61728c7fa29f1ec97736c7e4cbdbf4f0659ddf79e5c924d96ef60152163870), block 5423422 |
| Gas used | 1,177,620 — **one** transaction for a four-lock race |
| Cross-check | `calculateTxIndex` vs the block explorer, independently, for all four locks: **agrees** |

The cross-check is the point. The precompile derives the position from a Merkle path; Etherscan
reports it from its own index of the chain. Every settlement records whether the two agree, and a
disagreement would be a finding rather than something to paper over.

**The proof path, isolated from our code** —
[`evidence/proof-path-probe.json`](./evidence/proof-path-probe.json) runs against three real
pre-existing Sepolia transactions with none of our contracts deployed:

| Transaction | Block | `calculateTxIndex` at `0x0FD2` | Explorer | Agrees |
| --- | --- | --- | --- | --- |
| [`0x144bc395f407…`](https://sepolia.etherscan.io/tx/0x144bc395f407d98d722e780d805786125e07283e141006c6c9bfafa64c5f6f78) | 11613749 | **102** | 102 | yes |
| [`0xc58e9177d4de…`](https://sepolia.etherscan.io/tx/0xc58e9177d4dea9a25dc205d80e458da11efb56635f73900e2ae413ad699f77cf) | 11613750 | **131** | 131 | yes |
| [`0xf2b901f98983…`](https://sepolia.etherscan.io/tx/0xf2b901f9898354cfbb01af86150105eceb1cc04d93a5365066f12fd3a6b6bd09) | 11613751 | **163** | 163 | yes |

One shared continuity proof spanning headers 11613749→11613751 with 52 continuity roots, three
Merkle proofs, verified off-chain at the precompile for an estimated **3.81 × 10⁻⁵ CTC**.

Five settled races are recorded in `evidence/race-*.json`. Four settled against the currently
deployed vault and gate; `race-bd830e85.json` predates the 2026-09-03 redeploy and therefore
references the earlier pair. That is visible in the file, and is why every record carries the
addresses it settled against rather than assuming today's.

---

## 7. Honest timing, measured not asserted

| Stage | Cost |
| --- | --- |
| lock lands on Sepolia | instant |
| **attestation reaches that height** | **6.5–9.3 min** |
| proof generation | seconds |
| verification at `0x0FD2` + state transition | **one Creditcoin block, ~15s** |

**"One block" refers only to the last row.** Finality is minutes; settlement is one block once the
proof exists. We never claim proving is instant, and the UI is built so it cannot: the wait is shown
as a live block countdown read from `0x0FD3`, not hidden behind a spinner.

Attestcoin publishes no figure for this latency, so we measured it —
[`evidence/latency.jsonl`](./evidence/latency.jsonl), and the sampler is `ops/measure-latency.ts`:

| | |
| --- | --- |
| samples | **345** |
| window | 2026-09-01T16:24Z → 2026-09-02T17:02Z |
| min · p50 · p90 · p99 · max | 6.54 · 7.75 · 8.73 · 9.02 · **9.35** min |
| mean | 7.75 min |
| quoted in the product as | **6.5–9.3 min** — the same distribution, rounded for display |

Quoted as a **range** everywhere, never as an average, because attestation advances in **ten-block
batches** — so the lag is a sawtooth, and an average describes it wrongly. Two further datasets
corroborate the shape: `attestation-vs-finality.jsonl` (70 samples, attestation vs Ethereum's own
`safe`/`finalized`) and `attestation-frontier-gap.jsonl` (41 samples).

Run `bun run ops/measure-latency.ts --summary` for the current distribution. It warns when its
newest sample is stale rather than letting anyone quote an old figure as live.

---

## 8. Deployed contracts

Deployer on both chains: `0xd267C91BF81207222cC8d7300D11CD1849bd98Da`.

**Ethereum Sepolia** — chainId `11155111`, Attestcoin chainKey `1`

| Contract | Address |
| --- | --- |
| `PriorityVault` | [`0x000d8d9C5Ab3b3d98A574eCEB34136e885C16656`](https://sepolia.etherscan.io/address/0x000d8d9C5Ab3b3d98A574eCEB34136e885C16656) |
| `PUSD` (settlement token, 6dp) | [`0xAfA914EF2CF2D754647dc83175Aad6AcF42a9670`](https://sepolia.etherscan.io/address/0xAfA914EF2CF2D754647dc83175Aad6AcF42a9670) |

**Creditcoin CC3 testnet** — chainId `102031`

| Contract | Address |
| --- | --- |
| `AttestationGate` (the integration core) | [`0x1E6713DdF4a2D90fb871EF545941b3f190099153`](https://creditcoin-testnet.blockscout.com/address/0x1E6713DdF4a2D90fb871EF545941b3f190099153) |
| `PriorityEngine` | `0x16FD8A1b7fb4525eFa2D3801F642c84fbb982714` |
| `CollateralRegistry` | `0x39E984ed4875FfC41634e8495B8e45Cc01Ae79b5` |
| `ClaimToken` (ERC-1155 positions) | `0xFc1547aFeb6D69a525780918b3fa40A062372D45` |
| `RefinanceEngine` | `0x07A5b91f866A70D70C3164E3394286E1cB90A433` |

**Attestcoin precompiles**

| | |
| --- | --- |
| Native Query Verifier (BlockProver) | `0x0000000000000000000000000000000000000FD2` |
| ChainInfo | `0x0000000000000000000000000000000000000fd3` |

Addresses come from `contracts/deployments/*.json`, written by the deploy scripts — never from an
env var, because a mistyped vault address breaks the proof-to-vault binding the security model rests
on while looking like a verification failure.

> The CC3 explorer is **`creditcoin-testnet.blockscout.com`**. The host
> `explorer.cc3-testnet.creditcoin.network` appears in protocol documentation and **does not
> resolve** — we say so here so nobody reintroduces it, and a test asserts no API response can
> name it.

---

## 9. Evidence index

Everything in `evidence/` is written by tooling from chain responses. None of it is hand-authored,
and `ops/check-submission.ts` mechanically rejects any hex literal in the docs that is not traceable
to one of these files or visibly labelled `SAMPLE`.

| File | What it records |
| --- | --- |
| `precompile.json` | 10 live checks against `0x0FD2` and `0x0FD3` — reachability, chainKey read from the chain, the attestation lag, `calculateTxIndex` deriving an index, both `verify` selectors decoding, PUSH0 support. All pass. |
| `proof-path-probe.json` | the full proof path against three real Sepolia transactions with nothing of ours deployed |
| `race-88857090.json` | the same-block settlement in [§6](#6-proven-on-chain-the-same-block-settlement) — four locks, two sharing a block, one Creditcoin transaction |
| `race-1dc28886.json`, `race-83eef239.json`, `race-b48de31f.json`, `race-bd830e85.json` | four further settled races, including a four-tranche race and a single-lock race |
| `latency.jsonl` | 345 attestation-latency samples, the raw stream — recountable |
| `latency-summary.json` | the distribution those samples produce, plus a second direct experiment |
| `attestation-vs-finality.jsonl` | 70 samples comparing attestation against Ethereum `safe`/`finalized` |
| `attestation-frontier-gap.jsonl` | 41 frontier-gap samples |
| `deploy-cc3.log`, `prove-race-*.log`, `stage-race.log` | raw transcripts of the deploys and proving runs |

---

## 10. Testing

```bash
cd contracts  && make test             # 98 tests, one passing rejection per attack
cd contracts  && make test-fork        # 4 tests against a live CC3 fork
cd worker     && bun test              # 20 tests
cd precedence && bun test              # 995 tests — 692 API route, 303 SDK
cd precedence && bun run scripts/smoke.ts    # 3 protocol tracks + invariants
```

**1,113 tests that need no network**, plus 4 fork tests and 10 live-chain checks that do.
`make test` reports 98 passing and 1 skipped, across 6 suites.

| Suite | Tests | What it protects |
| --- | --- | --- |
| `contracts/test/PriorityProofLib.t.sol` | 20 | one passing rejection **per attack** |
| `contracts/test/EngineLifecycle.t.sol` | 28 | the settlement lifecycle and the waterfall |
| `contracts/test/PriorityVault.t.sol` | 25 | the source-chain vault, incl. pinned event signatures |
| `contracts/test/AllocationLib.t.sol` | 13 | tranche allocation |
| `contracts/test/AllocationAgreement.t.sol` | 5 | Solidity and TypeScript allocation agree |
| `contracts/test/Toolchain.t.sol` | 7 | the `usc-contracts` import paths and decoder actually compile |
| `contracts/test/fork/ForkDeploy.t.sol` | 4 | our contracts deploy, wire and settle under real chain conditions |
| `worker/test/proof.test.ts` | 20 | batch flattening — index alignment across three arrays |
| `precedence/test/api/**` | **692** | all 23 API routes |
| `precedence/sdk/test/**` | **303** | ordering, settlement, waterfall, the dApp-side checks |

**The security controls are tests, not comments.** `PriorityProofLib.t.sol` has one passing
rejection for each of: a look-alike vault, a reverted source transaction, a prover reordering the
set, omitting a middle lock, omitting the *first* lock, splicing two races together, a vault whose
`seq` contradicts the proof, and the wrong settlement denomination.

**The 995 TypeScript tests cover what a chain cannot check for us.** All 23 routes are tested for
the answer they give when a chain says no, and for what they refuse to accept: a lender's rank *is*
`(blockHeight, txIndex)`, so the routes decode those from a receipt fetched by hash rather than
accepting them from the party they rank — asserted to hold **even when the request says otherwise**.
`422` and `502` are held apart deliberately (the chain answered and refused, versus we could not ask
it) because retrying is correct in only one of them. Provenance has its own group: `mode` derives
from what each adapter reports about itself and never from the env var that was requested, so
requesting `chain` with nothing deployed still reads `mock`.

**None of the 1,113 touch a network, on purpose.** A unit test that could reach Sepolia would pass
or fail on a throttled RPC or an unattested block rather than on the code, and telling a real
regression apart from weather is the whole point. The live path is evidenced separately, in
`evidence/`.

`scripts/smoke.ts` additionally drives all three protocol tracks end to end and asserts the
invariants the claims rest on: strict seniority, first loss on the most subordinate tranche, `seq`
contiguity, strictly increasing `(height, txIndex)`, and that the same-block tie-break is actually
exercised.

---

## 11. Architecture and repository layout

| Path | What it is |
| --- | --- |
| `contracts/` | Foundry. **7 deployed contracts** + 3 libraries, 2,331 lines of Solidity. **98 tests + 4 fork tests** |
| `worker/` | the Attestcoin readability worker — ethers v6 + `@gluwa/usc-sdk`. Waits for attestation, builds the batch proof, preflights, submits. **20 tests** |
| `precedence/` | Next.js 16 command centre — 9 pages, 35 components, **23 API routes**, **692 route tests** |
| `precedence/sdk/` | **`@precedence/sdk`** — the protocol without the web app: data model, settlement mathematics, Attestcoin ChainInfo client. `viem` is its only peer dependency. **303 tests** |
| `ops/` | key generation, role funding, latency sampling, live precompile verification, the submission gate |
| `evidence/` | machine-written, judge-verifiable records — never hand-authored |
| `ATTESTCOIN_INTEGRATION.md` | how the protocol is used, use by use, with the code for each |

**Why a worker rather than doing it in the app.** Proof submission needs a signing key and a
6.5–9.3 minute wait. Neither belongs in a web request, and a server-side keeper key inside the app
would blur the very property the permissionless unwind exists to demonstrate. The Creditcoin adapter
in the app is read-mostly by design; when a settlement needs a proof it raises an error naming the
exact command rather than inventing a result.

**Why an SDK.** The data model, the ordering rules and the settlement mathematics are not part of a
web application. `@precedence/sdk` is what someone integrating proven-order priority would import —
see [`precedence/sdk/README.md`](./precedence/sdk/README.md).

---

## 12. `mock | chain` — the honesty mechanism

The app runs against fixtures or the real chains, and the switch is built to be hard to get wrong:

- The UI **never** reads an env var to decide what to claim. It reads each adapter's own `isLive()`,
  so a misconfigured environment produces a *degraded* demo, never a *dishonest* one.
- Requesting `chain` without deployed addresses does not throw and does not silently pretend. It
  falls back to fixtures and records **why**, visible at `/api/config` as a `note`.
- Fixtures use `0xSAMPLE…` prefixes. There is no invented transaction hash, address, block number or
  explorer link anywhere in this repository, and `ops/check-submission.ts` enforces that
  mechanically across all four public documents.
- A registration that was not signed is stored as a simulation, labelled as one, and carries no
  explorer link at all — because a locally-stored asset must never look like one that exists on a
  chain.

There is a related failure the split deployment can produce, and it has its own canary: if the API
is configured to live elsewhere but a request reaches the frontend's own route handler, `/api/config`
returns **503** with `misconfigured: "api-rewrite-not-applied"` rather than mock data. Simulated is a
deliberate configuration and safe to display; a routing failure produces meaningless answers, and
the two must not look alike.

**Where the LLM sits.** A model is used for exactly one thing: reading an unstructured collateral
document and proposing form values, strictly upstream of any capital decision. Bids are
deterministic policy — `LlmRuntime.decide()` calls the same policy function as `LocalRuntime.decide()`
— and settlement never depends on a model. Everything a model emits passes through
`ratifyExtraction`, which rejects by default, never overwrites the registered record, and reports a
document/registration disagreement as a **flag** for a human rather than a correction.

---

## 13. Scope — what the protocol proves

Every boundary below is a design decision with a reason, and each one is why a specific part of the
system looks the way it does.

**Proven ordering, deliberately scoped to ordering.** PRECEDENCE proves *which claim is senior* and
prevents the same registered claim being financed twice or out of order — the failure that took
down Tricolor and First Brands. Whether a custodian issued two receipts for one physical pallet is
a *document-authenticity* problem, solved by custody attestation and inspection, and it composes
with this rather than competing: we do the half that is cryptographically provable, and
hash-uniqueness makes the registered identifier itself unforgeable. Keeping those two problems
distinct is what lets us make a proof claim strong enough to settle capital on.

**Cold start is solved.** The record exists from the very first financing, because the financing
mechanism *is* the registration — no chicken-and-egg, no consortium to assemble, no adoption
threshold before the first lender is protected. Coverage then grows with use, one facility at a
time.

**Trustless mechanics, portable across jurisdictions.** The protocol makes the financial mechanics
trustless — allocation, seniority, refunds and the unwind all execute without a trusted party.
Legal enforceability of a lien remains jurisdiction-specific, which is exactly why the mechanics
are built to stand on their own rather than depending on a court to order them.

**Readability by design, and the architecture follows from it.** Creditcoin proves facts about
Sepolia; nothing flows back. That single constraint is what produces the system's best property:
the vault never waits to be told who won. It applies the same deterministic allocation rule that
Creditcoin applies, so both chains agree on the allocated set with no message, no bridge and no
relayer between them.

**Two-stage timing, stated because the interface depends on it.** Attestation of a source block
takes minutes; verification and the state transition then complete in one Creditcoin block. We
measured the first stage rather than estimating it ([§7](#7-honest-timing-measured-not-asserted)),
and the settlement page renders it as a live block countdown read from `0x0FD3` — so a viewer can
see exactly what is being waited on, and the UI cannot imply a proof is instant even if someone
later wanted it to.

## 14. Provenance and originality

**Built for this hackathon:**

- all 7 deployed contracts and 3 libraries (`contracts/src/`) and their 98 tests
- the Attestcoin readability worker (`worker/`)
- the protocol domain model, state machine, ordering rules and settlement mathematics
  (`precedence/sdk/`)
- every chain adapter, API route and screen in the command centre (`precedence/`)
- the operational and evidence tooling (`ops/`, `evidence/`)
- all 1,113 tests

**Disclosed prior work:** the Next.js foundation underneath the command centre — our own
design-token system, layout primitives and motion primitives — comes from **Ephera**, an earlier
project by this same team (private repo `ChaseBP/ephera`, since scrapped). The team owns it
outright and reuses it on every project we ship. Nothing protocol-specific is reused: no contract,
no proof logic, no settlement rule, no chain adapter, no API route.

Repository history begins 2026-09-02.

---

## 15. Run it yourself

Prerequisites: **bun** (`curl -fsSL https://bun.sh/install | bash`), **Foundry**
(`curl -L https://foundry.paradigm.xyz | bash && foundryup`), a dedicated Sepolia RPC endpoint, and
funded testnet keys on both Sepolia and Creditcoin CC3.

```bash
# 1. secrets — generates throwaway role keys; prints addresses only, never private keys
bun run ops/gen-keys.ts
#    then fill SEPOLIA_RPC and ETHERSCAN_API_KEY in .env.local

# 2. fund the roles (dry run first — it prints the plan and sends nothing)
bun run ops/fund-roles.ts
bun run ops/fund-roles.ts --execute

# 3. contracts
cd contracts && make build && make test

# 4. worker
cd ../worker && bun install && bun test && bun run src/cli.ts status

# 5. app
cd ../precedence && bun install && bun run build && bun run dev
```

`tCTC` comes from a Discord bot rather than a web faucet: join `discord.gg/creditcoin`, then in
`#token-faucet` run `/faucet address:0xYOUR_EVM_ADDRESS`.

### Deploy, then settle a real race

```bash
cd contracts && make deploy-sepolia && make deploy-creditcoin
cd ../worker && bun run src/cli.ts prove <collateralId> --from-vault
```

`forge script --broadcast` **cannot** be used on CC3: the transactions land, but Foundry then polls
for receipts by deserializing full blocks and CC3 blocks omit `mixHash`, so every poll fails with
`missing field mixHash` and the script never reaches its wiring calls. CC3 is deployed and wired
with `cast send`, and every permission is verified afterwards with a `cast call` read. This is
documented because it once left five contracts deployed with zero of their wiring transactions sent
while the deployment file looked complete.

---

## Licence

MIT. See [`LICENSE`](./LICENSE).
