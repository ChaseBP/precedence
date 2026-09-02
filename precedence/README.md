# PRECEDENCE — command centre

The Next.js front end for **PRECEDENCE**, the Proof-Ordered Capital Priority Protocol.
Project overview and setup: **[`../README.md`](../README.md)**. How the protocol is used:
**[`../ATTESTCOIN_INTEGRATION.md`](../ATTESTCOIN_INTEGRATION.md)**.

---

## Provenance — adapted from the team's own prior project

**This UI is adapted from the in-house starter**, an earlier project by the same team (private repo, since
scrapped). We own that code outright and its reuse here is deliberate and disclosed.

- **Adapted:** the Next.js scaffolding — layout, design-token system, motion primitives, component
  shells.
- **New work in this hackathon window:** the entire protocol domain model, the state machine, the
  settlement rules, and every chain adapter under `lib/precedence/`.

the in-house starter's original domain logic was a Solana LP coalition protocol. It has been **removed rather than
renamed** — `./scripts/audit-domain.sh` exists specifically to prove that and reports **0 leftover
references and 0 missing spec states**. Keep it at 0/0.

---

## Running it

```bash
bun install
bun run dev            # http://localhost:3000
bun run build
```

### Verification — prove it, do not assert it

```bash
bun run scripts/smoke.ts    # 3 protocol tracks + the invariants; must print ALL CHECKS PASSED
bunx tsc --noEmit           # clean
bun run build               # clean
./scripts/audit-domain.sh   # 0 and 0
```

`scripts/smoke.ts` is the one that matters. It drives all three storylines end to end and asserts
the properties the protocol's claims rest on: strict seniority (a junior tranche must never be paid
while a senior one is short), first loss landing on the most subordinate tranche, `seq` contiguity,
strictly increasing `(height, txIndex)`, and that the same-block tie-break is actually exercised.

---

## `mock | chain`

| | |
| --- | --- |
| `PRECEDENCE_MODE=mock` | fixtures. `0xSAMPLE…` prefixes throughout; no invented hashes or links |
| `PRECEDENCE_MODE=chain` | the deployed contracts, via `contracts/deployments/*.json` |

**The UI never reads these env vars to decide what to claim.** It reads each adapter's own
`isLive()`, so a misconfigured environment produces a *degraded* demo but never a *dishonest* one.
Requesting `chain` without deployed addresses falls back to fixtures and records **why** — visible
at `/api/config` as a `note`.

Settling a race and poking the failure branch are **not** done from the app. Both live in
`../worker/`, for two reasons: an Attestcoin proof needs ~8 minutes of attestation, which no web
request should wait for; and the keeper must visibly hold no privileges, which a server-side key
inside the app would blur. The relevant methods raise `RequiresWorkerError` with the exact command
to run.

### Persistence

`PRECEDENCE_STORE_PATH` makes state survive a restart. That matters once a race has cost real
testnet gas — the Creditcoin transaction exists whether or not the app remembers it. Leave it unset
for memory-only, which is correct for a read-only serverless deployment. On a Vercel + Azure split,
set it on the Azure host only.

---

## The protocol state machine

18 states across three tracks, and it **branches** — `nextPhase()` walks the track a state belongs
to, handlers may return an explicit `next`, and `canTransition()` rejects illegal moves.

- **performing:** `COLLATERAL_REGISTERED → RACE_OPEN → PRIORITY_SETTLED → CAPITAL_DRAWN →
  ENCUMBERED → REFI_DISCOVERED → ATOMIC_REFINANCE → REPAYMENT_PROOF → LIEN_RELEASED →
  SETTLED_CLOSED`
- **distressed:** `FROZEN_DRAW → PCR_STABILIZATION → GRACE_PERIOD → DUTCH_LIQUIDATION →
  TERMINATED_DEFAULT`, plus `BREACHED → DUTCH_LIQUIDATION`. Every transition is a **permissionless
  timestamp-gated keeper poke**, because lender protection must not depend on our uptime.
- **utility:** `AUTO_REFUND`, `ABORTED`.

`createRace({ scenario })` selects `performing | default | breach`, so the demo triggers the failure
act on command rather than waiting for a real default.

---

## Financier fleet

Deterministic policy, not a model. Different risk weights and capital caps are what produce the
visible accept / accept-smaller / reject divergence — and a judge can check a policy function with
visible weights, where they cannot check an LLM's decision.

| Financier | Mandate | Capital | Preferred tranche | Demotion |
| --- | --- | --- | --- | --- |
| **Meridian** | conservative, requires clear title | $50,000 | SENIOR | no |
| **Vector** | balanced, takes junior for yield | $20,000 | JUNIOR | yes |
| **Novum** | unproven, competes for senior on a 2× bond | $10,000 | SENIOR | no |
| **Kestrel** | prover — permissionless truth delivery | $15,000 | — | — |

### Where the LLM sits

`PRECEDENCE_RUNTIME=agent` enables a model for **collateral-document interpretation** (turning an
unstructured warehouse receipt into structured fields), **bid narration**, and **refinance
proposals**. It never decides a bid.

The rule, enforced by the `AgentRuntime` seam and `domain/ratify.ts`: **the model emits a proposal, a
deterministic filter validates it against hard limits, and only then does anything on-chain
happen.** Nothing a model produces is treated as evidence. `LlmRuntime.decide()` is deliberately
identical to `LocalRuntime.decide()`.

A document extraction that disagrees with the registered collateral is reported as a **flag**, never
applied as a correction — two sources disagreeing about a warehouse receipt is exactly what a human
should look at.

---

## Design system — settled, do not redesign

`app/globals.css` `:root` and `html.light` token blocks are **final**. Indigo `#536DFE` / `#2535F5`
accent, emerald `--proof-verified` matching Attestcoin's own readability convention, an **ordinal**
`--rank-senior/junior/subordinate` ramp so seniority reads from colour alone, and `--write: #D97706`
defined but deliberately unused — reserved for the future writability path. Fonts: Poppins + DM Sans
with IBM Plex Mono for hashes.

**Never hard-code a hex colour in a component.** Use the tokens.

---

## Honest proof lifecycle

| State | Meaning |
| --- | --- |
| `PENDING_EVIDENCE` | the source transaction exists; attestation has not reached its height yet. **A patient state, never an error** |
| `PROOF_AVAILABLE` | the builder service produced a proof |
| `VERIFIED` | `0x0FD2` returned true on Creditcoin |

Attestation takes **6.7–9.4 minutes, measured** (min 6.7 · p50 7.8 · p90 8.8 · max 9.4 over 86 samples — a sawtooth,
because attestation advances in batches). Verification then completes in one Creditcoin block.
Never let UI copy imply the proof is instant.

**The precompile does not check `receipt.status` — the dApp must**, and does, in
`AttestationGate` and `domain/proof.ts`.
