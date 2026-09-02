# PRECEDENCE

**The Proof-Ordered Capital Priority Protocol**

*BUIDL CTC 2026 Fall · Creditcoin × Attestcoin · RWA track*

Competing financiers race to lock capital against real-world collateral on **Ethereum Sepolia**. The
Attestcoin Native Query Verifier precompile at **`0x0FD2`** on **Creditcoin CC3** proves each lock
**and its canonical source-block position**, so lien priority settles by proven cryptographic
ordering rather than by legal filing. The winning claim mints as a tradeable ERC-1155 position,
outpaced capital auto-refunds, and the encumbrance registry populates itself as a by-product of
financing.

**Why it beats an oracle, in one line:** an oracle can *assert* which lock came first, but cannot
*cryptographically commit* to that ordering — and without ordering, priority collapses.

---

## Provenance and prior work — please read

**The web UI in `precedence/` is adapted from the team's own earlier project, the in-house starter** (private
repo, since scrapped). We own that code outright and its reuse here is deliberate. We are disclosing
it rather than presenting the scaffolding as new work.

**What is new work, created during this hackathon window:**

- all seven smart contracts (`contracts/`)
- the Attestcoin readability worker (`worker/`)
- the protocol domain model, state machine and settlement rules (`precedence/lib/precedence/`)
- the operational and evidence tooling (`ops/`, `evidence/`)

**What is adapted from the in-house starter:** the Next.js UI scaffolding — layout, design-token system, motion
primitives and component shells. Its original domain logic (a Solana LP coalition protocol) has been
removed rather than renamed; `precedence/scripts/audit-domain.sh` exists specifically to prove that,
and reports **0 leftover references**.

---

## The problem

Real-world secured lending runs on **priority**: when collateral fails, who gets paid first. The
*invisible encumbrance problem* destroys that structure, because lenders cannot see each other's
claims.

This is a 2025 problem, not a 2014 curiosity. **Tricolor Holdings** filed Chapter 7 in September
2025 having pledged the same auto loans to roughly twenty lenders — $1.4bn of real collateral
against $2.2bn pledged, with around $500m of losses at JPMorgan, Fifth Third and Barclays. **First
Brands Group** filed Chapter 11 two weeks later after selling the same receivables to multiple
lenders.

The industry's answer has been **detection** — hash-based duplicate-check registries a lender *may*
query. That approach is real and works (MonetaGo won distribution over SWIFT), but it is advisory,
opt-in, and bank-shaped. It did not stop either 2025 collapse.

PRECEDENCE is not another detection service. **The financing mechanism itself populates the
registry**, so using the system *is* joining it, and priority settles without anyone querying
anything.

---

## How it works

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

1. An obligor registers collateral as a **hash-unique** NFT on Creditcoin.
2. Financiers **lock pUSD** on Sepolia against it. Each lock is a real transaction at a real
   position in a real block.
3. The worker waits for attestation (**6.5–9.3 min, measured**), builds **one shared continuity proof**
   for the whole race, and preflights it for free.
4. `AttestationGate` settles the race in **one Creditcoin transaction**: a single batch
   `verifyAndEmit`, then the checks the precompile does not do.
5. **Priority settles by proven `(blockHeight, txIndex)` ordering.** A declared tranche is a
   *preference*; proven ordering decides who wins it. Bids beyond a tranche's sizing are
   **auto-refunded, never silently demoted** — a financier who bid SENIOR did not consent to
   subordinate risk.
6. Repayment runs a **strict seniority waterfall**. Default runs the **deterministic unwind**, every
   step a permissionless keeper poke.

Full detail: **[`ATTESTCOIN_INTEGRATION.md`](./ATTESTCOIN_INTEGRATION.md)**.

---

## The claim, measured on the live precompile

Sepolia's ~12s blocks make same-block locks likely, and a block height cannot order them.
`calculateTxIndex` can — and we verified that against `0x0FD2` with real transactions:

| Transaction | `calculateTxIndex` at `0x0FD2` | Block explorer | Agrees |
| --- | --- | --- | --- |
| `0x144bc395f407…` | **102** | 102 | yes |
| `0xc58e9177d4de…` | **131** | 131 | yes |
| `0xf2b901f98983…` | **163** | 163 | yes |

Given nothing but a Merkle path, the precompile derives the canonical position and it matches what
the chain independently reports. Reproduce it in one command — see below.

---

## Honest timing

| Stage | Cost |
| --- | --- |
| lock lands on Sepolia | instant |
| attestation reaches that height | **6.5–9.3 min** (p50 7.8 · p90 8.6, n=239 continuous + 3 direct) |
| proof generation | seconds |
| verification at `0x0FD2` + state transition | **one Creditcoin block, ~15s** |

**"One block" refers only to the last two stages.** Finality is minutes; settlement is one block.
Attestcoin does not document this latency, so we measured it and left the sampler running —
`evidence/latency.jsonl`. The lag is a **sawtooth** because attestation advances in batches, which
is why we always quote a range.

---

## Repository layout

| Path | What it is |
| --- | --- |
| `contracts/` | Foundry. Seven contracts, **88 tests + 4 fork tests** |
| `worker/` | the readability worker — ethers v6 + `@gluwa/usc-sdk`. **20 tests** |
| `precedence/` | Next.js command centre (UI adapted from the in-house starter — see Provenance) |
| `ops/` | key generation, funding, latency sampling, live precompile verification |
| `evidence/` | generated, judge-verifiable records — never hand-written |
| `ATTESTCOIN_INTEGRATION.md` | how the protocol is used, and what we do not claim |
| `rohan-plan.md` | the full technical specification |

---

## Setup

Prerequisites: **bun**, **Foundry**, a dedicated Sepolia RPC, and funded testnet keys.
Full list with where to get each: **[`PREREQUISITES.md`](./PREREQUISITES.md)**.

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

`tCTC` comes from a Discord bot, not a web faucet: join `discord.gg/creditcoin`, then in
`#token-faucet` run `/faucet address:0xYOUR_EVM_ADDRESS`.

### Verify the integration without deploying anything

```bash
# 10 live checks against both precompiles → evidence/precompile.json
bun run ops/verify-precompile.ts

# the full proof path against real Sepolia transactions → evidence/proof-path-probe.json
cd worker && bun run src/cli.ts probe \
  0x144bc395f407d98d722e780d805786125e07283e141006c6c9bfafa64c5f6f78 \
  0xc58e9177d4dea9a25dc205d80e458da11efb56635f73900e2ae413ad699f77cf \
  0xf2b901f9898354cfbb01af86150105eceb1cc04d93a5365066f12fd3a6b6bd09
```

### Deploy, then settle a real race

```bash
cd contracts && make deploy-sepolia && make deploy-creditcoin
cd ../worker && bun run src/cli.ts prove <collateralId> --from-vault
```

---

## `mock | chain` — the honesty mechanism

The app runs against fixtures or the real chain. The switch is designed to be hard to get wrong:

- The UI **never** reads an env var to decide what to claim. It reads each adapter's own
  `isLive()`, so a misconfigured environment produces a *degraded* demo, never a *dishonest* one.
- Requesting `chain` without deployed addresses does not throw and does not silently pretend. It
  falls back to fixtures and records **why** — visible at `/api/config`.
- Fixtures use `0xSAMPLE…` prefixes. There are no invented transaction hashes, addresses, block
  numbers, or explorer links anywhere in this repository.

---

## What we do not claim

**Ordering is not authenticity.** PRECEDENCE prevents double-**financing** of a *registered* claim
and settles which claim is senior. It **cannot** detect a custodian issuing two warehouse receipts
for one physical lot. Hash-uniqueness stops the same identifier being registered twice; it says
nothing about whether the paper corresponds to real coffee. Qingdao was forged duplicate
certificates — this protocol would not have caught that.

**Cold-start is solved; coverage is not.** The record exists from the first financing, with no
chicken-and-egg. That does not mean universal protection: a lender who never touches PRECEDENCE is
exposed exactly as before.

**Proof is not law.** On-chain proof does not equal legal enforceability. The protocol makes the
financial mechanics trustless; the legal framework remains jurisdiction-specific.

**Writability is out of scope.** Readability only — Creditcoin proves facts about Sepolia, not the
reverse. Every design decision follows from that constraint.

---

## Verification

```bash
cd contracts && make test              # 88 tests, incl. one passing rejection per attack
cd contracts && make test-fork         # 4 tests against a live CC3 fork
cd worker    && bun test               # 20 tests
cd precedence && bun run scripts/smoke.ts    # 3 protocol tracks + invariants
cd precedence && ./scripts/audit-domain.sh   # the in-house starter leftovers; target 0
```

The security controls are **tests, not comments**. `contracts/test/PriorityProofLib.t.sol` has one
passing rejection per attack: look-alike vault, reverted source transaction, prover reordering,
omitting a middle lock, omitting the *first* lock, splicing two races, a vault whose `seq`
contradicts the proof, wrong denomination.

---

## Licence

MIT for the contracts. See `LICENSE`.
