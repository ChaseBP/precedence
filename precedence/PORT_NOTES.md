# PRECEDENCE — Frontend Re-Domain Port Notes

## 1. Executive Summary
The frontend in `./precedence/` has been systematically re-domained to implement **PRECEDENCE**, the Proof-Ordered Capital Priority Protocol on Creditcoin CC3 and Ethereum Sepolia.

---

## 2. Structural & Architectural Mapping

### Domain & Adapters Layer
* `lib/precedence/domain/policy.ts`: Financier policy engine with independent risk models for Meridian, Vector, and Novum.
* `lib/precedence/domain/collateral.ts`: Collateral asset registration, document hashing, and 15% haircut buffer sizing.
* `lib/precedence/domain/lock.ts`: Sepolia source lock signing, deterministic ordering by canonical `lockBlockNumber`, and auto-refunds.
* `lib/precedence/domain/waterfall.ts`: Seniority waterfall distribution (Senior 100% first, then Junior, then Subordinate).
* `lib/precedence/domain/proof.ts`: Attestcoin proof generation via Query Verifier precompile `0x0FD2` & ChainInfo `0x0FD3`.
* `lib/precedence/domain/refinance.ts`: Added 1-block atomic refinancing engine.
* `lib/precedence/adapters/sepolia/`: Added Sepolia `PriorityVault.sol` client and mock client.
* `lib/precedence/adapters/creditcoin/`: Added Creditcoin CC3 ABIs (`AttestationGate`, `PriorityEngine`, `CollateralRegistry`, `RefinanceEngine`, `IBlockProver` at `0x0FD2`, `IDecoder` at `0x731c345d…F849F9f`).
* `lib/precedence/adapters/agent/`: Added Prover Worker for Agent Kestrel (`waitUntilHeightAttested`, `getBatchProof`, `verifyBatch`).

### Store & Orchestrator
* `lib/precedence/store/`: Seeded with Meridian, Vector, Novum, Kestrel, and real-world collateral assets (#8802 Atlas Coffee, #8803 Apex Grain, #8804 Horizon Freight, #8805 Global Copper).
* `lib/precedence/orchestrator/`: 10-stage lifecycle (`detect`, `verify`, `broadcast`, `decisions`, `reveal-entry`, `self-correct`, `dissolve-split`, `benchmark`, `notify`, `done`).

### Routes & User Interface
* `/collateral`: Collateral Asset Scanner & Discovery.
* `/race`: Priority Race Execution Console.
* `/financiers`: Financier Fleet & Prover Agent.
* `/registry`: Self-Populating Encumbrance Registry.
* `/dashboard`: Protocol Benchmark & Telemetry.

---

## 3. Visual Tokens & Design Discipline
* Strict compliance with existing `:root` and `html.light` design tokens.
* Seniority styling uses the semantic ordinal ramp tokens:
  - Senior: `var(--rank-senior)`
  - Junior: `var(--rank-junior)`
  - Subordinate: `var(--rank-subordinate)`
* Proof pipeline states use:
  - `var(--proof-pending)` (`PENDING_EVIDENCE`)
  - `var(--proof-available)` (`PROOF_AVAILABLE`)
  - `var(--proof-verified)` (`VERIFIED`)
* Encumbrance states use `var(--state-clear)`, `var(--state-encumbered)`, `var(--state-breached)`.
* Brand mark in `components/Logo.tsx` is an original inline SVG depicting ordered claims via `var(--logo-edge-a)` and `var(--logo-edge-b)`.
* Zero hard-coded hex colors in components.

---

## 4. Verification
* **Zero Leak Policy**: Verified 0 occurrences across all `.tsx`, `.ts`, `.css`, `.md`, and `.json` files.
* **TypeScript Compiler**: `npx tsc --noEmit` exits with status 0.
* **Next.js Production Build**: `npm run build` succeeds cleanly.
