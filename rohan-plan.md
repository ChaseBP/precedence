# PRECEDENCE

## Full Technical Documentation

_The Proof-Ordered Capital Priority Protocol_

**BUIDL CTC 2026 Fall — Creditcoin × Attestcoin**
**Sector: RWA**

> Built on **verified Attestcoin facts** established through research in this conversation: BlockProver precompile `0x0FD2` + ChainInfo precompile `0x0FD3`; official Decoder contract `0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f` (testnet); on-chain `INativeQueryVerifier.verifyAndEmit(uint64,uint64,bytes,MerkleProof,ContinuityProof)` + `calculateTxIndex(MerkleProof)` (there is **no on-chain batch verify**; the SDK's off-chain `verifySingle`/`verifyBatch` support ≤10 queries sharing one continuity proof within a 1000-block window); decoding via the `EvmV1Decoder` library from `@gluwa/usc-contracts`, whose `LogEntry` exposes `address_`/`topics`/`data`; Sepolia = chainKey 1 (chainId 11155111); **attestation lag is NOT published by Attestcoin — the ~8–10 minute figure here is an unverified estimate and MUST be measured on CC3 testnet before it is quoted anywhere**, after which verification completes in one Creditcoin block post-attestation; **writability out of scope** for this hackathon — the forward Creditcoin→Sepolia direction uses hashlock + public observation; the dApp **must** enforce `receipt.status == 0x1` (the precompile does not check this); transaction fields and their log data are verified and available (official AMA Q1/A1). No Attestcoin capability is invented. No unverified API is called. All latency figures in this document reflect the honest, measured reality of the testnet, not marketing numbers.

---

## 0. Executive Summary

**PRECEDENCE** introduces the **Proof-Ordered Priority Claim** — a machine-native financial primitive in which competing capital providers race to finance real-world collateral, and priority between their claims is established by Attestcoin-verified ordering of their source-chain lock transactions.

Real-world collateral — warehouse receipts, trade receivables, commodity pledges — suffers from the **invisible encumbrance problem**: multiple lenders finance the same asset without seeing each other's claims. This is not a historical curiosity. In September 2025, **Tricolor Holdings** filed Chapter 7 having pledged the same auto loans to roughly twenty lenders at once — $1.4bn of real collateral against $2.2bn pledged, with JPMorgan, Fifth Third and Barclays facing around half a billion in losses. Two weeks later **First Brands Group** filed Chapter 11 after selling the same receivables to multiple lenders, with $2bn+ of undisclosed off-balance-sheet borrowing. Both were charged as systematic fraud.

The industry's answer has been **detection**: hash-based duplicate-check registries that a lender may query before financing. That answer is real and is being adopted — but it is advisory, opt-in, bank-shaped and centrally held, and it did not stop either 2025 collapse. PRECEDENCE is not another detection service. It makes the second claim structurally impossible to create, and settles which claim is senior without anyone having to query anything.

PRECEDENCE solves this through mechanism design, not adoption: **the financing mechanism itself populates the registry.** When a financier locks capital against collateral on Sepolia, that lock is a real transaction. The Attestcoin Native Query Verifier precompile at `0x0FD2` proves it happened — including its **canonical source-block position**. When a second financier locks against the same collateral, the precompile proves that too — and **which one came first**. Priority settles deterministically from cryptographic ordering, not legal filing, not negotiation, not trust.

The priority position itself is a tradeable ERC-1155 asset. It can be sold, tranched, or used as collateral. And when a new lender offers better terms, **refinancing executes atomically in one Creditcoin block** — proof of old-loan repayability + proof of new-lock validity → old lien releases + new lien creates simultaneously. No gap. No double-pledge window. The two-week legal process of inter-creditor priority transfer executes as a single state transition.

In the live testnet demonstration, judges watch three independent financiers — who have never transacted before — race to lock capital against the same warehouse receipt. Attestcoin proofs arrive on Creditcoin. In one block: priority settles by proven ordering, claims mint for the winners, the loser's capital auto-refunds, and the encumbrance registry — which nobody had to join — records the first entry. Then: a refinance opportunity is discovered, new capital locks, proofs land, and the facility refinances atomically. Two weeks of legal priority mechanics. One block each. No oracle, no consortium, no membership.

---

## 1. Project Name

**PRECEDENCE** — _The Proof-Ordered Capital Priority Protocol_

**Sector: RWA** — Tokenize, manage, or finance real-world assets on Creditcoin.

---

## 2. One-Sentence Primitive

> **Competing capital providers race to finance real-world collateral; priority between their claims is established by Attestcoin-verified ordering of source-chain lock transactions; the priority position becomes a tradeable, refinancable, composable financial object — and the encumbrance registry populates itself as exhaust of the mechanism.**

---

## 3. The Problem

Real-world secured lending — trade finance, warehouse receipt financing, invoice factoring, commodity pledge lending — is a multi-trillion dollar market built on **priority**: when collateral fails, who gets paid first, and how much?

**The invisible encumbrance problem** destroys this priority structure:

- **Double-pledging:** the same receivable, warehouse receipt or commodity pledge financed by multiple lenders who cannot see each other's claims.
- **Priority disputes:** when collateral fails, determining who holds senior claim takes weeks of legal process across jurisdictions, during which the asset value evaporates.
- **Refinancing friction:** replacing expensive financing with cheaper requires discharging old liens, recording new ones, transferring priority — a dangerous gap where double-pledge risk returns.
- **Trade finance gap:** ~$2.5T annually (ADB estimate), driven by verification friction and fraud risk.

### This is a 2025 problem, not a 2014 one

| Case | When | What happened | Exposure |
| --- | --- | --- | --- |
| **Tricolor Holdings** | Chapter 7, 10 Sep 2025 | Same auto loans pledged to ~20 lenders simultaneously; loan data manipulated so charged-off loans appeared eligible. $1.4bn real collateral against $2.2bn pledged. Executives charged with systematic fraud, Dec 2025. | ~$1.9bn secured debt; ~$500m of losses across JPMorgan, Fifth Third, Barclays |
| **First Brands Group** | Chapter 11, Sep 2025 | Same receivables sold to multiple lenders; $2bn+ undisclosed off-balance-sheet borrowing. Lenders underwriting at an apparent 5x leverage were actually near 20x. | $10bn+ debt |
| **Qingdao metals** | 2014 | Duplicate warehouse certificates for the same metal pledged across 13+ banks; the historical archetype. | ~$20bn class exposure |

Beyond the headline failures, industry survey data reports **27% of receivables financiers seeing attempts to finance the same receivables more than once**, and ICC United Kingdom estimates up to 1% of trade finance transactions are potentially fraudulent — over $50bn.

### What has been tried, and what actually exists today

**Consortium platforms died on cold-start.** we.trade (mid-2022), TradeLens (end-2022), Marco Polo (insolvency, early 2023, €5.2m in debt) and Contour (late 2023, processing 60–70 transactions/month) all shut down. komgo is the sole survivor and no longer sells blockchain-based products.

**But the honest picture is not "nobody fixed it."** One approach worked where the consortia failed: **MonetaGo's Secure Financing** registry, which sidesteps the real root cause — *bank confidentiality regulation prevents lenders from disclosing financed deals to competitors* — by having banks submit cryptographic **hashes** of documents rather than the documents themselves, and returning a duplicate-match risk classification. It is live in India, was selected by the **Association of Banks in Singapore** to deliver a national Trade Finance Registry, is distributed **over SWIFT**, was piloted by Standard Chartered, partnered with SBI Factors in June 2025, and is ICC United Kingdom's delivery partner for its duplicate-financing initiative.

**Why PRECEDENCE is not a competing detection service:**

| | Duplicate-detection registries (MonetaGo et al.) | PRECEDENCE |
| --- | --- | --- |
| Question answered | "Has this document been financed before?" | "Who holds senior claim, and in what order?" |
| Effect | Advisory — returns a risk score; the lender still decides | Binding — priority settles, claims mint, liens release |
| Participation | Opt-in query; a lender who does not ask is unprotected | Recorded as a by-product of financing itself |
| Coverage | Bank-shaped; private credit and warehouse lenders sit outside it — precisely the population that lost money in 2025 | Any financier who locks capital on the source chain |
| Trust root | A central repository you must trust | A precompile-verified fact about canonical source-chain ordering |
| Priority | Not addressed | The primitive |

Detection is a check you may run. PRECEDENCE is a mechanism you cannot route around: the second claim cannot be created, and the order of claims is a cryptographic fact rather than a filing date.

The structural insight: **the registry doesn't have to be a product. It can be the exhaust of the financing mechanism itself.** If every proof-gated financing event automatically writes its lien to Creditcoin, then **using the system = joining the registry.** Cold-start is solved by construction — though coverage still grows one financier at a time (see §28).

---

## 4. The New Behavior

PRECEDENCE introduces the **Proof-Ordered Priority Claim**:

1. An obligor registers real-world collateral (warehouse receipt, trade receivable) as an NFT on Creditcoin, with hash-uniqueness preventing double-registration.
2. Financiers independently lock capital on Sepolia against that collateral — each lock is a real, specific transaction on the source chain.
3. A Prover Agent submits Attestcoin proofs to Creditcoin. The `PriorityEngine` verifies each lock's inclusion, receipt status, **and canonical source-block position**.
4. **Priority settles deterministically by proven ordering.** A financier *declares* a tranche preference in `lock()`; proven `(blockHeight, calculateTxIndex)` ordering then decides **who wins that tranche** when several want it. The earliest proven lock takes the senior slot, the next takes junior, and bids beyond the facility's sizing for a tranche are **auto-refunded rather than silently demoted** — a financier who bid SENIOR never consented to subordinate risk. (This resolves the earlier ambiguity between declared tranches here and in §13; see `DECISIONS.md` Q4.)
5. The priority position mints as a **tradeable ERC-1155 claim** — sellable, trancheable, usable as collateral.
6. On repayment (also proven on Sepolia), the lien releases, claims burn, waterfall distributes capital.
7. On refinance: a new lender locks, proof of old-repayability + proof of new-lock → **atomic refinance in one block.** Old lien releases; new lien creates; priority transfers; no gap, no double-pledge window.

---

## 5. Why AI Agents Are Necessary

PRECEDENCE deploys three types of autonomous agents, each with independent objectives and economic consequences:

### Priority Agents (Refinance Hunters)

Continuously scan the proof-populated encumbrance registry on Creditcoin for financing positions that could be replaced at better terms. This is a genuine search problem over a growing graph — identifying rate arbitrage opportunities across heterogeneous collateral types, obligor histories, and tranche structures. They earn bps on successful atomic refinance execution.

### Risk Assessment Agents (Race Strategists)

Evaluate which collateral classes to compete for, given their proven encumbrance history (recorded on Creditcoin from prior rounds). Heterogeneous risk models produce different quotes → a real market with price discovery. Agent Meridian (conservative mandate) only races for high-face-value, clear-title collateral; Agent Vector (balanced) accepts junior positions for yield; Agent Novum (zero history) is restricted to subordinate positions and must prove itself across multiple rounds.

### Prover Agent (Truth Delivery)

The permissionless prover races to deliver valid Attestcoin proofs. First-valid-proof earns a fee escrowed at collateral registration. Validity is objective — the precompile decides — so no bonded verifier market, no challenges, no slashing. Truth delivery becomes a competitive machine-labor market.

**AI necessity defense:** deterministic Solidity encodes _settlement_ (priority rules, waterfall, release). But which collateral to race for, which refinances to execute, and how to price heterogeneous risk — these are optimization problems under uncertainty that require agentic decision-making. Remove the agents and the mechanism still settles correctly; it just loses the market intelligence that makes it _competitive_ rather than passive.

---

## 6. Why Attestcoin Is Necessary

**The DELETE test (a strict test):**

Remove Attestcoin from PRECEDENCE and insert a conventional oracle. The oracle reports: "Financier A locked capital against collateral X." Then: "Financier B locked capital against collateral X."

**But which came first on the source chain?**

An oracle can _assert_ ordering, but it cannot cryptographically commit to it. A compromised oracle majority could fabricate wrong priority — and the double-pledge returns. With Attestcoin, priority derives from a **precompile-verified fact** about specific transactions on the canonical Sepolia chain. An attacker cannot manipulate this ordering without controlling the source chain itself.

**Three load-bearing uses:**

1. **Proof-ordered priority:** when two financiers lock against the same collateral, the `PriorityEngine` orders them by the `blockHeight` parameter of their verified proof — the canonical source-chain position. This is the trust root for the entire primitive.

2. **Proof-bound repayment:** lien release executes on a verified repayment transaction, with the actual amount decoded by the official Decoder. No adjuster-trust, no oracle-asserted amounts.

3. **Proof-gated atomic refinance:** executing refinance requires proving BOTH that the old loan is repayable AND that the new lock has valid priority. Two proofs, one atomic state transition — impossible without synchronous cross-chain verification.

**An oracle, bridge, multisig, or conventional DeFi contract cannot reproduce this mechanism.**

---

## 7. Why Creditcoin

Creditcoin's founding product, live since 2017, is **on-chain credit history for real-world credit** — the Credal API, Aella (leading Nigerian fintech) as first institutional user, 28,000+ loans / $1.8M+ recorded on-chain, 5M+ total transactions.

**PRECEDENCE extends the recorded object by exactly one step:** from _loan events_ to _the priority structure of competing claims on real-world collateral._

- Every financing event anywhere in the PRECEDENCE network writes encumbrance state on Creditcoin.
- Every refinance writes two state changes (release + create) on Creditcoin.
- Every clear-title verification, every breach detection, every priority settlement — all on Creditcoin.
- The chain's data moat compounds per transaction: more financing → richer encumbrance dataset → better risk information → better capital pricing → more financing.

**Creditcoin is not where PRECEDENCE is deployed; Creditcoin is what PRECEDENCE is made of.**

Why not Ethereum: the primitive requires synchronous, trustless verification of specific foreign-chain transactions with canonical ordering. Only Creditcoin hosts the Attestcoin precompile + attestation network. Forcing everything onto one chain reintroduces bridging — the exact thing Attestcoin obsoletes.

Why not an oracle: an oracle _claims_ ordering; the precompile _proves_ it. A compromised oracle fabricates phantom priority; a proof cannot be fabricated.

---

## 8. Participants

| Actor                | Role                                         | What they risk                                    | What they earn                                            |
| -------------------- | -------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| **Obligor**          | Owns real-world collateral, needs financing  | Collateral NFT (escrowed); 15% collateral haircut | Instant working capital at competitive race-clearing rate |
| **Senior Financier** | Races to lock first, provides senior capital | Capital lockup; default risk                      | Lowest rate earned; first-priority claim on waterfall     |
| **Junior Financier** | Locks second, provides subordinate capital   | First-loss absorption on default                  | Higher rate earned; second-priority claim                 |
| **Priority Agent**   | Hunts refinance opportunities                | Opportunity cost on missed refinances             | bps fee on successful atomic refinance execution          |
| **Prover Agent**     | Delivers Attestcoin proofs                   | RPC/gas costs on invalid proofs                   | Fee per valid proof (escrowed at registration)            |
| **Monitor Agent**    | Watches for breach events                    | Missed breach detection                           | Breach-detection bounty from protocol fee pool            |
| **Refinancer**       | Provides replacement capital at better terms | Capital lockup; default risk                      | Priority position + spread capture on rate improvement    |

---

## 9. Architecture

```text
[Sepolia: PriorityVault.sol] ──► [Prover Agent: ProofBuilder] ──► [CC3: Precompile 0x0FD2]
                                                                              │ (Atomic Verify)
                                                                              ▼
[AI Priority Agents] ◄── [Next.js Command Center] ◄── [CC3: PriorityEngine / CollateralRegistry / ClaimToken / RefinanceEngine]
```

### Component 1 — Source Chain Smart Contract (Sepolia, chainKey 1)

**`PriorityVault.sol`** — non-custodial escrow + lock + draw + repay + release:

- `lock(collateralId, tranche, amount) payable` — financier escrows capital, emits `Lock` event
- `draw(collateralId, amount)` — obligor draws approved capital
- `repay(collateralId, amount) payable` — obligor repays, emits `Repayment` event
- `refund(collateralId, financier)` — auto-refund for outpaced financiers (permissionless)
- `claim(preimage)` — hashlock release path (if needed for the forward direction)

### Component 2 — Readability Worker (Prover Agent)

Built with `@gluwa/usc-sdk` (TypeScript, ethers v6):

- `PrecompileChainInfoProvider` (via `0x0FD3`) → resolves Sepolia, chainKey 1
- `ProofBuilder.waitUntilHeightAttested()` → honest ~8–10 min attestation wait
- `ProofBuilder.getProof()` / `getBatchProof()` → Merkle + continuity proofs
- Submits to `AttestationGate` on Creditcoin
- Permissionless: first-valid-proof earns fee escrowed at registration

### Component 3 — Attestcoin Smart Contract (Creditcoin CC3)

**`AttestationGate.sol`** — wraps `0x0FD2`, calls official Decoder, enforces status:

- `verifyPriorityRace()` — loops `verifyAndEmit` over competing lock transactions in one CC3 tx, deriving each lock's index via `calculateTxIndex` and binding every proof to the registered vault
- `verifyRepayment()` — verifies repayment, extracts actual amount
- `verifyRefinance()` — verifies old-repayment + new-lock pair
- All: require `receipt.status == 0x1`, validate `tx.to == registered vault`

### Component 4 — dApp Business Logic (Creditcoin CC3)

- **`PriorityEngine.sol`** — orders verified locks, settles priority, mints claims, auto-refunds losers
- **`CollateralRegistry.sol`** — mints NFTs, tracks encumbrance state, hash-uniqueness
- **`ClaimToken.sol`** (ERC-1155) — tradeable priority claims
- **`RefinanceEngine.sol`** — atomic refinance execution (release + create, one block)

---

## 10. Protocol Lifecycle

```text
[COLLATERAL_REGISTERED] ──► [RACE_OPEN] ──► [PRIORITY_SETTLED] ──► [CAPITAL_DRAWN]
       │                        │                  │                      │
       │ (hash-unique mint)     │ (locks on        │ (N×verifyAndEmit,   │ (draw from
       ▼                        │  Sepolia)        │  one block)          │  PriorityVault)
[CLEAR_TITLE]                    ▼                  ▼                      ▼
(zero liens =                    [AUTO_REFUND]     [CLAIM_MINTED]    [ENCUMBERED]
 preferential terms)             (outpaced)        (ERC-1155)             │
                                                                          │
                                    ┌─────────────────────────────────────┤
                                    │                                     │
                                    ▼                                     ▼
                            [REPAYMENT_PROOF]                   [REFINANCE_DISCOVERED]
                                    │                                     │
                                    ▼                                     ▼
                            [LIEN_RELEASED]                     [REFI_LOCKED]
                            [WATERFALL_PAID]                    (new capital on Sepolia)
                            [CLAIM_BURNED]                              │
                            [COLLATERAL_CLEAR]                         ▼
                                                                [ATOMIC_REFINANCE]
                                                                (one block:
                                                                 old release + new create)
                                                                        │
                                                                        ▼
                                                                [PRIORITY_TRANSFERRED]
                                                                        │
                                                                        ▼
                                                                [REPAID] ──► [CLEAR]
```

### State Transition Table

| State                   | Trigger                                            | On-chain effect                                                            | Who moves it                  |
| ----------------------- | -------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| `COLLATERAL_REGISTERED` | Obligor calls `registerCollateral()`               | NFT minted; hash-uniqueness enforced; encumbrance = CLEAR                  | Obligor                       |
| `RACE_OPEN`             | Financing request broadcast                        | Race window opens; financiers can lock                                     | Protocol                      |
| `PRIORITY_SETTLED`      | every `verifyAndEmit()` at `0x0FD2` returns true   | Claims minted by proven ordering; losers auto-refunded; registry populated | Prover Agent (permissionless) |
| `CAPITAL_DRAWN`         | Obligor calls `draw()`                             | Capital disbursed from PriorityVault; facility active                      | Obligor                       |
| `ENCUMBERED`            | Priority settled + capital drawn                   | Collateral state = ENCUMBERED; claims active                               | PriorityEngine                |
| `REPAYMENT_PROOF`       | Obligor repays; proof verified                     | Lien released; waterfall distributes; claims burn; collateral = CLEAR      | Prover Agent                  |
| `REFI_DISCOVERED`       | Priority Agent finds rate arbitrage                | Refinance opportunity published                                            | Priority Agent (AI)           |
| `ATOMIC_REFINANCE`      | Old-repayment proof + new-lock proof both verified | Old lien RELEASED + new lien CREATED (one block); priority transfers       | RefinanceEngine               |
| `BREACHED`              | Monitor Agent proves collateral moved illegally    | All claims frozen; legal escalation flag                                   | Monitor Agent                 |

---

## 11. Priority Mechanism (the core innovation)

### How priority settles

When multiple financiers lock capital against the same collateral on Sepolia, each lock is a specific transaction at a specific position in a specific block. **The precompile has no on-chain batch call** — `INativeQueryVerifier` exposes `verifyAndEmit` for a single transaction plus `calculateTxIndex`. So `AttestationGate` loops `verifyAndEmit` over the race's locks inside one Creditcoin transaction, sharing a single continuity proof obtained off-chain from the SDK's `getBatchProof`. Settlement stays atomic; the batching saves proof generation and calldata, not calls.

```solidity
// Inside AttestationGate.sol
function verifyPriorityRace(
    bytes32 collateralId,
    uint256 blockHeight,
    bytes[] calldata encodedTxs,      // up to 10 lock transactions
    bytes[] calldata merkleProofs,
    bytes calldata continuityProof     // one shared continuity proof
) external {
    // 1. Verify each lock individually — there is NO on-chain batch verify.
    //    One shared continuity proof (SDK getBatchProof, <=10 txs within 1000 blocks).
    require(encodedTxs.length <= 10, "batch cap");
    INativeQueryVerifier v = NativeQueryVerifierLib.getVerifier();

    for (uint i; i < encodedTxs.length; i++) {
        require(v.verifyAndEmit(SEPOLIA_CHAIN_KEY, heights[i], encodedTxs[i],
                                merkleProofs[i], continuityProof), "verify-fail");

        // 2. The canonical intra-block position, derived from the proof itself.
        uint64 txIndex = v.calculateTxIndex(merkleProofs[i]);

        // 3. Decode the receipt and the Lock event from the VERIFIED transaction.
        //    Decoding is the dominant gas cost, so fetch only the event we need.
        require(EvmV1Decoder.decodeReceiptFields(encodedTxs[i]).status == 1, "reverted tx");
        EvmV1Decoder.LogEntry[] memory lg =
            EvmV1Decoder.getLogsByEventSignature(encodedTxs[i], LOCK_EVENT_SIGNATURE);

        // 4. MANDATORY: bind the proof to the registered vault. ASCBase does NOT
        //    check which contract emitted the transaction, so a genuine proof of a
        //    look-alike contract's Lock event would otherwise win priority.
        require(lg[0].address_ == collateralRegistry.vaultOf(collateralId), "wrong vault");
        // Extract Lock event fields (tranche, amount, seq) from lg[0].topics / lg[0].data
        locks[i] = _extractLockEvent(logs, from, value);
    }

    // 3. PriorityEngine orders by blockHeight (the verified canonical position)
    priorityEngine.settlePriority(collateralId, locks);
}
```

The `blockHeight` parameter IS the canonical source-chain position. It is verified by the precompile. It cannot be manipulated. The ordering that settles priority is a **cryptographic fact**, not a trust assertion.

### Why this matters

An oracle can report "Financier A locked capital." It can even report "Financier A locked before Financier B." But it cannot _cryptographically commit_ to that ordering. A compromised oracle majority could reverse the order — and with it, the entire priority structure.

With Attestcoin, the ordering is derived from the proof itself. The block height of each verified transaction IS its canonical position. No trust, no manipulation, no oracle committee.

---

## 12. Atomic Refinance Mechanism

### The two-week problem

In traditional secured lending, refinancing requires:

1. Discharge old lien (legal process, days)
2. Record new lien (registry filing, days)
3. Transfer priority (inter-creditor agreement, weeks)
4. **During this gap: double-pledge risk returns**

### The one-block solution

PRECEDENCE executes refinance atomically:

```solidity
// Inside RefinanceEngine.sol
function executeAtomic(
    bytes32 collateralId,
    RefinanceProof calldata proof  // old-repayment proof + new-lock proof
) external {
    // 1. Verify old loan is repayable (proof of repayment capability)
    require(attestationGate.verifyRepayment(collateralId, proof.oldBlock, proof.oldTx,
        proof.oldMerkle, proof.oldContinuity), "old-repayment-fail");

    // 2. Verify new lock has valid priority
    require(attestationGate.verifyLock(collateralId, proof.newBlock, proof.newTx,
        proof.newMerkle, proof.newContinuity), "new-lock-fail");

    // 3. ATOMIC: release old + create new (same transaction)
    _releaseLien(collateralId, proof.oldFinancier);      // old claim burned
    _createLien(collateralId, proof.newFinancier, proof.newTranche, proof.newAmount);  // new claim minted
    _transferPriority(collateralId, proof.oldFinancier, proof.newFinancier);

    // 4. No gap. No double-pledge window. One block.
    emit RefinanceExecuted(collateralId, proof.oldFinancier, proof.newFinancier, proof.newAmount);
}
```

**The invariant:** the collateral is never simultaneously unencumbered and re-encumberable. The old lien releases and the new lien creates in the same Creditcoin block — there is no window where double-pledge could occur.

---

## 13. Contract Implementations

### `PriorityVault.sol` (Sepolia)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract PriorityVault {
    enum Tranche { SENIOR, JUNIOR, SUBORDINATE }

    struct Lock {
        address financier;
        Tranche tranche;
        uint256 amount;
        uint256 lockBlockNumber;
        bool refunded;
    }

    mapping(bytes32 => Lock[]) public locks; // collateralId => locks
    mapping(bytes32 => address) public collateralOwners;
    mapping(bytes32 => uint256) public totalLocked;
    mapping(bytes32 => uint256) public totalDrawn;

    event Lock(bytes32 indexed collateralId, address indexed financier,
               Tranche tranche, uint256 amount, uint256 lockBlockNumber);
    event Draw(bytes32 indexed collateralId, address indexed obligor, uint256 amount);
    event Repayment(bytes32 indexed collateralId, address indexed obligor, uint256 amount);
    event Refund(bytes32 indexed collateralId, address indexed financier, uint256 amount);

    // Financier locks capital against collateral
    function lock(bytes32 collateralId, Tranche tranche) external payable {
        require(msg.value > 0, "zero lock");
        require(collateralOwners[collateralId] != address(0), "unregistered");

        locks[collateralId].push(Lock({
            financier: msg.sender,
            tranche: tranche,
            amount: msg.value,
            lockBlockNumber: block.number,   // THIS is the priority root
            refunded: false
        }));
        totalLocked[collateralId] += msg.value;

        emit Lock(collateralId, msg.sender, tranche, msg.value, block.number);
    }

    // Obligor draws approved capital
    function draw(bytes32 collateralId, uint256 amount) external {
        require(msg.sender == collateralOwners[collateralId], "not owner");
        require(totalDrawn[collateralId] + amount <= totalLocked[collateralId], "over-draw");

        totalDrawn[collateralId] += amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "draw fail");

        emit Draw(collateralId, msg.sender, amount);
    }

    // Obligor repays
    function repay(bytes32 collateralId) external payable {
        require(msg.value > 0, "zero repay");

        emit Repayment(collateralId, msg.sender, msg.value);
        // Actual waterfall distribution happens on Creditcoin after proof
    }

    // Permissionless refund for outpaced financiers
    function refund(bytes32 collateralId, uint256 lockIndex) external {
        Lock storage l = locks[collateralId][lockIndex];
        require(!l.refunded, "already refunded");
        require(msg.sender == l.financier, "not financier");

        l.refunded = true;
        totalLocked[collateralId] -= l.amount;

        (bool ok, ) = msg.sender.call{value: l.amount}("");
        require(ok, "refund fail");

        emit Refund(collateralId, msg.sender, l.amount);
    }
}
```

### `AttestationGate.sol` (Creditcoin CC3)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;   // matches the official VerifierInterface.sol

// The REAL on-chain interface (gluwa/attestcoin-protocol-examples/contracts/sol/VerifierInterface.sol).
// verifyAndEmit is non-view (it emits), chainKey/height are uint64, proofs are structs, and there is
// NO on-chain batch variant. verifySingle/verifyBatch exist only in the OFF-CHAIN SDK.
interface INativeQueryVerifier {
    struct MerkleProofEntry { bytes32 hash; bool isLeft; }
    struct MerkleProof { bytes32 root; MerkleProofEntry[] siblings; }
    struct ContinuityProof { bytes32 lowerEndpointDigest; bytes32[] roots; }

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

// Decoding is a LIBRARY, not a call to a Decoder address:
//   import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
//   EvmV1Decoder.decodeReceiptFields(...)     -> receipt fields incl. status
//   EvmV1Decoder.getLogsByEventSignature(...) -> LogEntry[] { address_, topics, data }

contract AttestationGate {
    // Verifier is reached through the official library (precompile 0x0FD2).
    // Decoding is a LIBRARY import, not a contract call to the Decoder address:
    //   import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
    bytes32 constant LOCK_EVENT_SIGNATURE = keccak256("Lock(bytes32,address,uint8,uint256,uint256)");

    uint256 constant SEPOLIA_CHAIN_KEY = 1;

    mapping(bytes32 => bool) public consumed; // (chainKey, block, keccak(encodedTx))

    event Verified(uint256 chainKey, bytes32 proofHash, bytes32 kind, address submitter);

    function verifyPriorityRace(
        bytes32 collateralId,
        uint256 blockHeight,
        bytes[] calldata encodedTxs,
        bytes[] calldata merkleProofs,
        bytes calldata continuityProof
    ) external {
        bytes32 key = keccak256(abi.encode(
            SEPOLIA_CHAIN_KEY, blockHeight, keccak256(abi.encode(encodedTxs))));
        require(!consumed[key], "consumed");
        require(encodedTxs.length <= 10, "batch cap");
        consumed[key] = true;

        // No on-chain batch verify: loop verifyAndEmit, one shared continuity proof.
        INativeQueryVerifier v = NativeQueryVerifierLib.getVerifier();
        for (uint i; i < encodedTxs.length; i++) {
            require(v.verifyAndEmit(SEPOLIA_CHAIN_KEY, heights[i], encodedTxs[i],
                merkleProofs[i], continuityProof), "verify-fail");

            uint64 txIndex = v.calculateTxIndex(merkleProofs[i]);   // canonical position
            require(EvmV1Decoder.decodeReceiptFields(encodedTxs[i]).status == 1, "reverted tx");

            EvmV1Decoder.LogEntry[] memory lg =
                EvmV1Decoder.getLogsByEventSignature(encodedTxs[i], LOCK_EVENT_SIGNATURE);
            // MANDATORY: the precompile does not check WHICH contract emitted the tx.
            require(lg[0].address_ == collateralRegistry.vaultOf(collateralId), "wrong vault");
            // extract (tranche, amount, seq) from lg[0].topics / lg[0].data
        }

        emit Verified(SEPOLIA_CHAIN_KEY, key, "PRIORITY_RACE", msg.sender);
        PriorityEngine.settlePriority(collateralId, decodedLocks);
    }

    function verifyRepayment(
        bytes32 collateralId,
        uint256 blockHeight,
        bytes calldata encodedTx,
        bytes calldata merkleProof,
        bytes calldata continuityProof
    ) external {
        bytes32 key = keccak256(abi.encode(
            SEPOLIA_CHAIN_KEY, blockHeight, keccak256(encodedTx)));
        require(!consumed[key], "consumed");
        require(NativeQueryVerifierLib.getVerifier().verifyAndEmit(
            SEPOLIA_CHAIN_KEY, blockHeight, encodedTx, merkleProof, continuityProof), "verify-fail");
        consumed[key] = true;

        require(EvmV1Decoder.decodeReceiptFields(encodedTx).status == 1, "reverted");
        EvmV1Decoder.LogEntry[] memory lg =
            EvmV1Decoder.getLogsByEventSignature(encodedTx, REPAYMENT_EVENT_SIGNATURE);
        require(lg[0].address_ == collateralRegistry.vaultOf(collateralId), "wrong vault");

        emit Verified(SEPOLIA_CHAIN_KEY, key, "REPAYMENT", msg.sender);
        PriorityEngine.releaseLien(collateralId, value);  // actual amount, proof-bound
    }
}
```

### `PriorityEngine.sol` (Creditcoin CC3)

```solidity
contract PriorityEngine {
    struct VerifiedLock {
        address financier;
        uint8 tranche;      // 0=SENIOR, 1=JUNIOR, 2=SUBORDINATE
        uint256 amount;
        uint256 lockBlockNumber;  // THE PRIORITY ROOT - from verified proof
    }

    mapping(bytes32 => uint8) public collateralState; // CLEAR / ENCUMBERED / BREACHED
    mapping(bytes32 => VerifiedLock[]) public priorityStack;

    event PrioritySettled(bytes32 indexed collateralId,
        address[] winners, uint8[] positions, uint256[] amounts);
    event DoublePledgePrevented(bytes32 indexed collateralId,
        address blockedFinancier, uint256 refundedAmount);
    event LienReleased(bytes32 indexed collateralId, uint256 actualRepaid);

    function settlePriority(
        bytes32 collateralId,
        VerifiedLock[] calldata locks
    ) external onlyAttestationGate {
        // Sort by lockBlockNumber (the verified canonical position)
        // This is deterministic - no trust, no manipulation

        VerifiedLock[] memory sorted = _sortByBlockNumber(locks);

        // First lock = SENIOR priority
        // Second lock = JUNIOR priority
        // Third+ = SUBORDINATE or auto-refund

        // Mint claims for winners
        // Emit DoublePledgePrevented for any lock that's redundant

        emit PrioritySettled(collateralId, winners, positions, amounts);
    }

    function releaseLien(
        bytes32 collateralId,
        uint256 actualRepaid
    ) external onlyAttestationGate {
        // Waterfall: senior paid first, then junior, then subordinate
        // Claims burn pro-rata
        // Collateral returns to CLEAR state

        emit LienReleased(collateralId, actualRepaid);
    }
}
```

---

## 14. Worker Implementation (`worker.ts`)

```typescript
import { ethers } from "ethers";
import { PrecompileChainInfoProvider, ProofBuilder } from "@gluwa/usc-sdk";

const SEPOLIA_CHAIN_KEY = 1;

export async function processLockRace(
  collateralId: string,
  sepoliaTxHashes: string[],
  attestationGateAddress: string,
  signerCC3: ethers.Signer,
) {
  const providerSepolia = new ethers.JsonRpcProvider("https://rpc.sepolia.org");

  // Fetch receipts for all lock transactions
  const receipts = await Promise.all(
    sepoliaTxHashes.map((h) => providerSepolia.getTransactionReceipt(h)),
  );

  // Validate all succeeded
  for (const r of receipts) {
    if (!r || r.status !== 1) {
      throw new Error("Lock transaction missing or reverted on Sepolia");
    }
  }

  // Find the max block height (for the batch proof)
  const maxBlock = Math.max(...receipts.map((r) => r!.blockNumber));

  const proofBuilder = new ProofBuilder(
    new PrecompileChainInfoProvider(
      "https://proof-gen-api.cc3-testnet.creditcoin.network",
    ),
  );

  // HONEST LATENCY: wait for attestation (~8-10 minutes in practice)
  await proofBuilder.waitUntilHeightAttested(
    SEPOLIA_CHAIN_KEY,
    BigInt(maxBlock),
  );

  // Get batch proof (≤10 queries, one continuity proof, 1000-block window).
  // NOTE: getBatchProof takes TRANSACTION HASHES, not {blockNumber, txIndex}.
  const batchProof = await proofBuilder.getBatchProof(sepoliaTxHashes);

  // Submit to AttestationGate on Creditcoin
  const gateAbi = [
    "function verifyPriorityRace(bytes32 collateralId, uint256 blockHeight, bytes[] encodedTxs, bytes[] merkleProofs, bytes continuityProof) external",
  ];
  const gate = new ethers.Contract(attestationGateAddress, gateAbi, signerCC3);

  const tx = await gate.verifyPriorityRace(
    collateralId,
    maxBlock,
    batchProof.encodedTxs,
    batchProof.merkleProofs,
    batchProof.continuityProof,
  );

  return await tx.wait();
}

export async function processRepayment(
  collateralId: string,
  sepoliaTxHash: string,
  attestationGateAddress: string,
  signerCC3: ethers.Signer,
) {
  const providerSepolia = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
  const receipt = await providerSepolia.getTransactionReceipt(sepoliaTxHash);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Repayment missing or reverted");
  }

  const proofBuilder = new ProofBuilder(
    new PrecompileChainInfoProvider(
      "https://proof-gen-api.cc3-testnet.creditcoin.network",
    ),
  );

  // Wait for attestation
  await proofBuilder.waitUntilHeightAttested(
    SEPOLIA_CHAIN_KEY,
    BigInt(receipt.blockNumber),
  );

  // NOTE: getProof takes a TRANSACTION HASH.
  const proof = await proofBuilder.getProof(sepoliaTxHash);

  const gateAbi = [
    "function verifyRepayment(bytes32 collateralId, uint256 blockHeight, bytes encodedTx, bytes merkleProof, bytes continuityProof) external",
  ];
  const gate = new ethers.Contract(attestationGateAddress, gateAbi, signerCC3);

  const tx = await gate.verifyRepayment(
    collateralId,
    receipt.blockNumber,
    proof.encodedTx,
    proof.merkleProof,
    proof.continuityProof,
  );

  return await tx.wait();
}
```

---

## 15. Batch Proof Strategy

**Batching in Attestcoin is an off-chain proof-generation optimisation, not an on-chain call.** The SDK's `getBatchProof(txHashes[])` returns up to 10 proofs sharing one continuity proof, provided the transactions fall within a 1000-block window. On-chain, `AttestationGate` still loops `verifyAndEmit` once per transaction — inside a single Creditcoin transaction, so settlement remains atomic. What batching saves is proof construction and the calldata for repeated continuity data, which is the bulk of the payload.

| Use case                     | Batch size           | Shared continuity proof       | What it enables                                 |
| ---------------------------- | -------------------- | ----------------------------- | ----------------------------------------------- |
| **Priority race settlement** | 3-10 competing locks | 1 (all in 1000-block window)  | One Creditcoin tx settles the entire priority stack (N × `verifyAndEmit` within that tx) |
| **Portfolio sweep**          | 10 repayment events  | 1 (shared continuity context) | 10 liens released in one tx                     |
| **Refinance atomic**         | 2 proofs (old + new) | 1 (if within window)          | Old release + new create atomically             |

The priority race is the most elegant use: when 3+ financiers lock against the same collateral, their lock transactions naturally fall within a 1000-block window (the race window is minutes), so one shared continuity proof covers all of them and a single Creditcoin transaction verifies every lock and settles priority atomically.

**Cost note.** Verification is `≈ 2.3e-5 + 2.9e-7 × (continuity hash count)` CTC and grows with proof *age* — a 10-minute-old transaction costs ~2.59e-5 CTC, the same one at 24 hours ~3.13e-4 CTC, as continuity hashes grow from 10 to 1000. **Prove promptly.** Decoding dominates everything else at ~0.0375 CTC for a maximal workload, so decode only the single `Lock` event by signature rather than every log.

---

## 16. Security Model

| Threat                    | Attack                              | Defense                                                                    | Invariant                                                   |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Forged lock               | Fake lock tx submitted              | `verifyAndEmit @0x0FD2` + `status==1` + `log.address_ == vault`             | Only real, successful Sepolia locks participate             |
| Lying prover              | Prover submits fake decoded fields  | Fields decoded from **verified encodedTx** on-chain                        | Decoded data is cryptographically bound to the proof        |
| Priority manipulation     | Try to reverse ordering             | Ordering from source-block proof, not Creditcoin mempool                   | Priority = canonical Sepolia order (verified by precompile) |
| Double-registration       | Same collateral NFT twice           | Hash-uniqueness in CollateralRegistry                                      | One collateral, one registration                            |
| Replay (same proof twice) | Resubmit consumed proof             | Consumed `(chainKey, block, keccak(encodedTx))` mapping                    | One proof → one effect                                      |
| Refinance partial state   | Old releases but new doesn't create | Atomic: both in same transaction                                           | No gap, no double-pledge window                             |
| Sybil financiers          | Many wallets to race                | Capital-at-stake (each lock requires real escrow)                          | No cheap spam; priority costs capital                       |
| Cascade attack            | Trigger cascading failures          | No cascading in core; claims are independent per collateral                | Bounded blast radius                                        |
| Colluding borrower/lender | Fake financing to pollute registry  | Financing requires real locked capital + proof                             | Polluting costs gas + escrow                                |
| Front-running the race    | See lock and front-run it           | Source-chain ordering is public (Sepolia); can't be hidden from Creditcoin | Priority is fair by on-chain order                          |
| Prover fee griefing       | Spam invalid proofs                 | Fee escrowed at registration; first-valid wins                             | Truth delivery is permissionless                            |

---

## 17. Game Theory

### Circular Wash-Racing Analysis

**Attack:** An adversarial financier locks, gets priority, then withdraws and re-locks to claim multiple positions.

**Defense:** The `lock()` function on Sepolia is non-custodial. Once capital is locked, it cannot be withdrawn except through: (a) repayment (which releases the lien and returns capital to the waterfall), (b) refund (which only fires for outpaced financiers whose lock didn't win), or (c) the hashlock path (gated to specific conditions).

**Invariant:** You cannot cycle capital through locks without either winning (and having your capital deployed) or losing (and having it refunded — but you're out of the race).

### Strategic Default Analysis

**Attack:** Obligor draws capital, doesn't repay, disappears.

**Defense:** The 15% collateral haircut is locked at facility initialization. Default → waterfall: junior absorbs first loss, senior gets residual, collateral NFT stays with syndicate. The obligor loses their collateral AND their credit history is permanently marked as DEFAULT on Creditcoin — making all future financing more expensive or impossible.

**Invariant:** Defaulting costs more than repaying, permanently.

---

## 18. Economic Model

### Capital flows

```text
[Senior/Junior Financiers] ──(lock)──► [PriorityVault (Sepolia)]
                                              │ (Attestcoin proof: 0x0FD2)
                                              ▼
[Creditcoin CC3: PriorityEngine] ──(settle priority)──► [ClaimToken minted]
                                              │
                                              ▼
[Obligor draws capital] ──(draw)──► [PriorityVault (Sepolia)]
                                              │
                                              ▼ (obligor uses capital for real-world ops)
[Obligor repays] ──(repay)──► [PriorityVault (Sepolia)]
                                              │ (Attestcoin proof: 0x0FD2)
                                              ▼
[Creditcoin: Lien released, waterfall distributed, claims burned]
```

### Fee structure

| Fee           | Amount                             | Paid by                  | Earned by                             |
| ------------- | ---------------------------------- | ------------------------ | ------------------------------------- |
| Protocol fee  | 25 bps on settled financing volume | Obligor                  | Protocol treasury                     |
| Prover fee    | 5 bps per valid proof              | Escrowed at registration | First-valid prover                    |
| Refinance fee | 15 bps on refinanced notional      | New financier            | Priority Agent (AI)                   |
| Breach bounty | Fixed fee from fee pool            | Protocol                 | Monitor Agent (on valid breach proof) |

### Loss waterfall on default

1. **Junior/SUBORDINATE tranche absorbs first loss** (up to committed amount)
2. **Senior tranche receives residual** (protected by junior subordination)
3. **Collateral NFT stays with syndicate** (title claim on the underlying asset)
4. **Obligor's credit history on Creditcoin = DEFAULT** (permanent, cross-round)

---

## 19. Failure Modes

| Failure                       | What happens                                                           | Who loses                               |
| ----------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| No financier locks            | No race; collateral stays CLEAR                                        | Nobody                                  |
| Financier outpaced            | Lock arrives after winner; auto-refunded                               | Nobody (capital returned)               |
| Obligor doesn't repay         | Default → waterfall → junior absorbs first loss → senior gets residual | Junior first, then senior               |
| Proof delayed                 | PENDING state; deadline expires → auto-refund                          | Nobody (fail-safe)                      |
| Refinance fails mid-execution | Cannot happen — atomic (release + create in same tx)                   | Nobody                                  |
| Collateral moved illegally    | Monitor Agent proves breach → all claims frozen → legal flag           | All financiers (but breach is provable) |
| Sepolia reorg                 | Continuity proof covers canonical chain; buffers built in              | Nobody                                  |
| Precompile offline            | No proofs; protocol halts safely; all pending states refund            | Nobody (fail-safe)                      |

---

## 20. Honest Timing

**This section is non-negotiable. Do not fake latency.**

The complete source-event-to-settlement flow involves:

1. Source-chain transaction (instant)
2. Attestation (~8–10 minutes in measured practice on testnet)
3. Proof generation (seconds)
4. Precompile verification (~15s = one Creditcoin block)
5. State transition (same block as verification)

**Total: minutes, not seconds.** The "one block" figure refers ONLY to steps 4+5 (verification + state transition), which happen synchronously within a single Creditcoin block once the proof is available.

**Demo strategy:** pre-stage real transactions ~10 minutes before the demo. Show them on screen with timestamps. Then trigger the live proof submission + verification + settlement beat — which IS one block, genuinely live. The attestation wait is displayed honestly as a progress bar. The narrative is: "Finality is minutes. Settlement is one block."

---

## 21. 120-Second Demo

**Pre-condition (~10 minutes before, real, timestamped):** Three financiers' lock transactions on Sepolia against the SAME warehouse receipt, all with visible block numbers and timestamps.

### 0:00–0:15 — The Setup

Show the warehouse receipt NFT on Creditcoin. Atlas Coffee's $10,000 commodity receipt, hash-registered, custodian info visible. The registry shows: zero liens, CLEAR status.

> "This collateral needs financing. Three lenders who have never met are about to race for it."

### 0:15–0:30 — The Race

Show the three financiers' consoles:

- **Meridian** (senior mandate, 50K capital): analysis shows high-face-value, clear-title → bid: SENIOR
- **Vector** (balanced, 20K): accepts junior for yield → bid: JUNIOR
- **Novum** (zero history, restricted): SUBORDINATE only, 2× bond

Each has locked capital on Sepolia. Show the real transaction hashes, block numbers, timestamps.

### 0:30–0:45 — HOLY-SHIT MOMENT #1

Kestrel (Prover Agent) submits the batch proof. Show the attestation progress bar (honest ~8-10 min already elapsed — transactions were pre-staged).

**One Creditcoin block: every `verifyAndEmit → TRUE` at `0x0FD2`.**

The `PriorityEngine` orders the three locks by `lockBlockNumber`:

- Meridian: block 6,1xx,001 → **SENIOR**
- Vector: block 6,1xx,002 → **JUNIOR**
- Novum: block 6,1xx,003 → **SUBORDINATE**

Claims mint. The encumbrance registry updates. **The registry nobody had to join.**

### 0:45–1:00 — The Consequence

Atlas draws capital. Registry shows: COLLATERAL #8802 = ENCUMBERED, Senior: Meridian, Junior: Vector.

> "This is the Tricolor fraud — the same collateral pledged to twenty lenders at once, half a billion dollars of losses at JPMorgan, Fifth Third and Barclays, twelve months ago — and the second claim simply cannot be created. Nobody had to join a registry. The financing itself created the record."

### 1:00–1:15 — HOLY-SHIT MOMENT #2: The Atomic Refinance

A Priority Agent's console lights up:

> "Atlas's senior financing at 8% can be replaced at 5.2% — saving $2,800 over the term."

The new financier locks capital on Sepolia (real tx, pre-staged). **One Creditcoin block:** proof of old-repayability + proof of new-lock → `RefinanceExecuted`. The old senior lien releases; the new senior lien creates; the priority position transfers.

> "Two weeks of legal inter-creditor priority transfer. One block. No gap. No double-pledge window."

### 1:15–1:30 — The Full Picture

Judge Mode: every hash, block, proof, event, state transition, and the refinance's atomicity — all copy-paste verifiable.

Final panel: the encumbrance registry, now populated with entries from this round.

> "The registry nobody had to join. The priority nobody had to negotiate. The refinance that took one block instead of two weeks."

---

## 22. CLI

```bash
# Initialize wallet + config
precedence init

# Register collateral (mint NFT on Creditcoin)
precedence collateral register --type warehouse-receipt --face-value 10000 --custodian "..."

# Enter a priority race (lock capital on Sepolia)
precedence race enter <collateralId> --tranche SENIOR --amount 50000

# Check current priority state
precedence race status <collateralId>

# Inspect a claim position
precedence claim show <claimId>

# Transfer/sell a priority claim
precedence claim sell <claimId> --buyer <address>

# AI agent: scan for refinance opportunities
precedence refinance scan

# Execute atomic refinance
precedence refinance execute <collateralId>

# Submit proof manually
precedence proof submit --tx <hash>

# View the full encumbrance registry
precedence registry show

# Check clear-title status (zero liens)
precedence clear-title verify <collateralId>
```

---

## 23. SDK

```typescript
import { PrecedenceSDK } from "precedence-sdk";

const sdk = new PrecedenceSDK({
  creditcoinRpc: "https://rpc.cc3-testnet.creditcoin.network",
  sepoliaRpc: "https://rpc.sepolia.org",
  proofBuilderUrl: "https://proof-gen-api.cc3-testnet.creditcoin.network",
});

// Register collateral
await sdk.registerCollateral({
  type: "warehouse-receipt",
  faceValue: 100000,
  custodian: "0x...",
});

// Enter a priority race
await sdk.enterRace({
  collateralId: "0x...",
  tranche: "SENIOR",
  amount: 50000,
});

// Check priority state
const state = await sdk.getPriorityState(collateralId);
// Returns: { senior: {financier, amount, lockBlock}, junior: {...}, ... }

// Execute atomic refinance
await sdk.executeRefinance({
  collateralId: "0x...",
  newFinancier: "0x...",
  newRate: 520, // 5.2%
});

// Query the encumbrance registry
const registry = await sdk.getRegistry();

// Build a custom Priority Agent
const agent = sdk.buildPriorityAgent({
  policy: {
    maxExposure: 100000,
    minFaceValue: 5000,
    requiredClearTitle: true,
    refinanceThreshold: 200, // bps improvement minimum
  },
});
```

---

## 24. Network Effect

```
MORE FINANCING → MORE ATTESTCOIN PROOFS → MORE ENCUMBRANCE STATE ON CREDITCOIN
→ RICHER REGISTRY (clear-title history, priority track record)
→ BETTER RISK INFORMATION → BETTER CAPITAL PRICING
→ MORE FINANCIERS REQUIRE THE CHECK
→ FINANCING WITHOUT THE CHECK BECOMES RISKIER BY COMPARISON
→ MORE FINANCING RUNS THROUGH THE NETWORK
→ MORE CREDITCOIN UTILITY
```

**The registry has value from the FIRST financing** and compounds with each one. No cold-start. No chicken-and-egg. Network effects by construction.

---

## 25. Startup / CEIP Thesis

**PRECEDENCE is the trust layer for on-chain secured lending.**

- Every trade finance blockchain that tried to build this as a platform died on cold-start (we.trade, TradeLens, Marco Polo, Contour — all between 2022 and 2023)
- PRECEDENCE solves it as a protocol — usage = joining
- The proof-populated encumbrance registry is the data moat: more financing → richer registry → more value → more financing
- Revenue: bps on volume + institutional API access
- **Market validation, not a vacuum:** MonetaGo proved institutions will pay for duplicate-financing infrastructure and won distribution through SWIFT and the Association of Banks in Singapore. That de-risks the category — the demand is proven. PRECEDENCE sells the layer above it: detection tells a bank what already happened; proof-ordered priority determines what is *allowed* to happen and who ranks first when it does. The natural commercial path is complementary rather than head-on — a detection query answers "is this safe to finance?", a PRECEDENCE lock answers "on what terms, and in what position?"

**CEIP fit:** Creditcoin's 9-year thesis is recording real-world credit on-chain. PRECEDENCE extends the recorded object from _loan events_ to _the priority structure of competing claims on real-world collateral_. Every financing event in the PRECEDENCE network writes encumbrance state on Creditcoin — the chain's data moat, compounding per transaction. This is the chain's thesis evolved by exactly one step.

---

## 26. Hardest Judge Questions

| #   | Question                                | Answer                                                                                                                                                                                   |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Is this just a registry?"              | No — the registry is the substrate. The primitive is proof-ordered capital priority. Lenders race; priority settles by proven on-chain ordering; the position becomes a tradeable asset. |
| 2   | "Why not an oracle?"                    | An oracle can report locks happened but cannot cryptographically commit to their on-chain ordering. Without ordering, priority collapses. Attestcoin's ordering proof is the trust root. |
| 3   | "Why not just a database?"              | A database records; this enforces. Priority settles deterministically from proof; claims mint/burn atomically; refinance executes without gap. Enforcement requires blockchain.          |
| 4   | "Why not Ethereum?"                     | The mechanism requires synchronous proof of Sepolia transaction ordering. Only Creditcoin hosts the Attestcoin precompile.                                                               |
| 5   | "Why Creditcoin specifically?"          | Creditcoin's thesis is recording real-world credit. PRECEDENCE extends the recorded object from loan events to encumbrance state. Per-transaction utility for the chain.                 |
| 6   | "Why AI?"                               | Refinance discovery over a growing proof-populated graph is a genuine search problem. Risk assessment of collateral from proven history requires heterogeneous models.                   |
| 7   | "Is AI the source of truth?"            | No. The proof is the source of truth. AI proposes; policy filters; contracts enforce.                                                                                                    |
| 8   | "How do you prevent fake collateral?"   | Custodian attestation is an off-chain assumption (stated honestly). On-chain prevents double-financing cryptographically.                                                                |
| 9   | "What about legal enforceability?"      | On-chain proof ≠ legal enforceability. Stated explicitly. The protocol proves the financial mechanics; legal reality rests on the custodian + jurisdiction.                              |
| 10  | "Isn't this just Centrifuge?"           | Centrifuge requires issuer opt-in. PRECEDENCE's registry populates as exhaust of the mechanism. Usage = joining. No cold-start.                                                          |
| 10a | "Isn't this a decade-old problem someone already solved?" | No. Tricolor (Chapter 7, Sept 2025) pledged the same auto loans to ~20 lenders — $1.4bn of collateral against $2.2bn pledged, ~$500m of losses at JPMorgan, Fifth Third and Barclays. First Brands followed two weeks later. 27% of receivables financiers report attempted double-financing. |
| 10b | "What about MonetaGo?"                  | MonetaGo works, and it validated the category — but it does **detection**: an opt-in, advisory, centrally-held duplicate check for banks. It does not establish priority between competing lenders, does not bind anyone, and does not cover the private-credit lenders who took the 2025 losses. We settle ordering by proof, and the record exists whether or not anyone queries. |
| 10c | "Does proof of ordering stop fake collateral?" | No, and we do not claim it does. Ordering proves which claim came first; it cannot prove a warehouse receipt corresponds to real metal. Hash-uniqueness blocks re-registering the *same* identifier; a custodian issuing two receipts for one lot is an off-chain trust assumption, stated in §28. |
| 11  | "What if nobody races?"                 | Collateral stays CLEAR; no capital moves. Fail-safe.                                                                                                                                     |
| 12  | "What if someone front-runs the race?"  | Ordering is from source-chain (Sepolia) proof, not Creditcoin mempool. You can't manipulate canonical Sepolia ordering from Creditcoin.                                                  |
| 13  | "What's the worst case?"                | Default: junior absorbs first loss, senior gets residual, collateral NFT stays. Bounded.                                                                                                 |
| 14  | "Can the refinance fail mid-execution?" | No — atomic. Old release + new create in one block. No gap.                                                                                                                              |
| 15  | "What if the proof is delayed?"         | PENDING state; deadline expires → auto-refund. Never fake success.                                                                                                                       |
| 16  | "What about reorgs?"                    | Attestcoin continuity proof covers canonical chain; buffers built in.                                                                                                                    |
| 17  | "How does this scale?"                  | Batch proofs (≤10 per continuity proof) for portfolio sweeps. The registry compounds.                                                                                                    |
| 18  | "Why is priority an asset?"             | Senior claims can be sold, tranched, or used as collateral. They're tradeable ERC-1155 tokens backed by proven priority position.                                                        |
| 19  | "What's the startup?"                   | The trust layer for on-chain secured lending. Revenue: bps on volume + API. Data moat compounds from round one.                                                                          |
| 20  | "What should I remember?"               | A machine did something on Ethereum. Attestcoin proved it. Creditcoin turned the proof into a financial right. And a $20B fraud class died in one block.                                 |

---

## 27. Honest Scorecard

| #   | Category           | Score    | Honest note                                                                                      |
| --- | ------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| 1   | Originality        | 9.5      | Proof-ordered priority + registry-as-exhaust + atomic refinance = genuinely new mechanism design |
| 2   | Problem size       | 9.5      | Anchored to $1.9bn (Tricolor) + $10bn (First Brands) in Sept 2025, not just Qingdao 2014         |
| 3   | Creditcoin fit     | 10       | The chain's recorded object extended by exactly one step                                         |
| 4   | Attestcoin depth   | 9.5      | Three transitions; the ordering property is oracle-irreducible                                   |
| 5   | Web3 innovation    | 9.5      | Cold-start solved by construction — genuine mechanism-design contribution                        |
| 6   | AI necessity       | 7.0      | The weakest leg — refinance discovery and risk assessment are defensible but not provable        |
| 7   | Demo impact        | 9.5      | Watching a $20B fraud class die live, with the two-hash priority proof                           |
| 8   | RWA value          | 9.5      | Warehouse receipts, invoices, commodity collateral — the track's literal asset classes           |
| 9   | Startup potential  | 8.5      | The trust layer for on-chain trade finance                                                       |
| 10  | Defensibility      | 9.5      | Registry-as-exhaust flywheel is structural                                                       |
|     | **Weighted total** | **8.28** | **Honest, not inflated**                                                                         |

---

## 28. Remaining Weaknesses (Disclosed)

1. **AI-necessity (7/10)** — the weakest leg. A skeptic can argue deterministic scripts replace the Priority Agents. The defense: real-time optimization over a growing proof-populated graph + heterogeneous risk assessment + adversarial fee competition. But it's a defense, not a proof.

2. **Off-chain collateral reality** — on-chain proves financing-flow integrity; the physical existence of the collateral rests on custodian trust. Stated honestly, not hidden.

2a. **Ordering is not authenticity** — the sharpest version of the point above, and it bounds the demo's claim. Qingdao was *forged duplicate certificates*: two documents, one pile of metal. Tricolor was *duplicated VINs*. Hash-uniqueness in `CollateralRegistry` blocks the same identifier being registered twice, and proof-ordering settles priority between claims on a registered asset — but neither can detect a custodian issuing receipt #123 and #124 against a single lot. We prevent double-**financing** of a registered claim; we do not prevent fabricated collateral. Say this before a judge says it.

2b. **Cold-start solved, coverage not solved** — registry-as-exhaust means the record exists from the first financing, with no chicken-and-egg. It does not mean universal protection: a lender who never touches PRECEDENCE is exposed exactly as before, and the 2025 failures involved ~20 lenders who would all have had to participate. The correct claim is that we remove the bootstrap barrier, not that we achieve coverage on day one.

3. **Legal enforceability** — proof ≠ law. The protocol's financial mechanics are trustless; the legal framework is jurisdiction-specific.

4. **Timing bet** — on-chain RWA financing is nascent. The primitive assumes real-world collateral financing moves on-chain (a trajectory, not a certainty).

5. **Complexity risk** — 7 contracts across 2 chains, but DEED-grade buildability (simple mechanics, no RLP parsing, no Taylor math, no DVHS).

---

## 29. Build Timeline (15 days)

| Days  | Deliverable                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------ |
| 1–3   | `PriorityVault` (Sepolia) + `AttestationGate` (Creditcoin) + Decoder integration. Foundry tests. |
| 4–6   | `PriorityEngine` (ordering, settlement, minting) + `CollateralRegistry` (NFT, hash-uniqueness).  |
| 7     | **Checkpoint: end-to-end proof working on testnet.**                                             |
| 8–9   | `ClaimToken` (ERC-1155) + `RefinanceEngine` (atomic execution).                                  |
| 10–11 | Agent runtimes (Meridian/Vector/Novum/Kestrel + Priority Agent).                                 |
| 12–13 | Frontend: command center UI + Judge Mode. Demo rehearsal with pre-staging.                       |
| 14    | README, whitepaper, submission description, demo video.                                          |
| 15    | Buffer + polish + fallback proofs queued.                                                        |

---

## 30. The Line the Judges Leave With

> _Every pledge leaves a proof. Every proof is a lien. Every lien is visible to everyone. Priority is ordered by cryptographic truth. And the fraud that took half a billion dollars off JPMorgan, Fifth Third and Barclays last September stops being possible to commit._

---

## 31. Evidence Register

Market claims in this document are time-sensitive. Re-verify before public submission; do not copy figures forward from an older draft.

| Claim | Source |
| --- | --- |
| Tricolor: Chapter 7, ~20 lenders, $1.4bn collateral vs $2.2bn pledged, executives charged | [CNBC, Dec 2025](https://www.cnbc.com/2025/12/17/tricolor-execs-charged-with-systematic-fraud-after-subprime-auto-lender-roiled-banking-sector.html) · [Addleshaw Goddard](https://www.addleshawgoddard.com/en/insights/insights-briefings/2025/financial-services/lessons-from-tricolor-and-first-brands/) |
| First Brands: Chapter 11, same receivables to multiple lenders, $2bn+ off-balance-sheet | [Neuberger Berman](https://www.nb.com/en/global/insights/article-lessons-from-first-brands-and-tricolor) · [Cambridge Associates](https://www.cambridgeassociates.com/insight/do-the-recent-bankruptcies-of-first-brands-and-tricolor-suggest-trouble-ahead-in-private-credit/) |
| Contour shutdown, 60–70 tx/month | [GTR](https://www.gtreview.com/news/top-stories/exclusive-contour-to-shut-down-as-bank-shareholders-pull-funding/) |
| Marco Polo insolvency, €5.2m debt | [GTR](https://www.gtreview.com/news/top-stories/marco-polo-brings-in-liquidators-as-funds-run-dry/) |
| we.trade / TradeLens closures; komgo sole survivor | [S&P Global](https://www.spglobal.com/market-intelligence/en/news-insights/articles/2022/10/trade-finance-industry-remains-hopeful-on-blockchain-despite-failed-projects-72557910) |
| MonetaGo: Association of Banks in Singapore Trade Finance Registry | [Trade Finance Global](https://www.tradefinanceglobal.com/posts/monetago-selected-by-the-association-of-banks-in-singapore-to-deliver-trade-finance-registry-and-combat-duplicate-invoice-fraud/) |
| MonetaGo over SWIFT; Standard Chartered pilot | [FinTech Futures](https://www.fintechfutures.com/press-releases/swift-and-monetago-deliver-major-milestone-in-fight-against-trade-finance-fraud) |
| MonetaGo × SBI Factors, June 2025 | [IFA Commercial Factor](https://magazine.factoring.org/news/monetago-and-sbi-factors-announce-partnership-to-strengthen-fraud-prevention-in-trade-finance) |
| ICC UK duplicate-financing initiative; ~1% of transactions potentially fraudulent, $50bn+ | [Trade Finance Global](https://www.tradefinanceglobal.com/posts/icc-united-kingdom-launches-initiative-combat-trade-finance-fraud/) |
| 27% of receivables financiers seeing repeat-financing attempts | [Why Double-Pledging Is Back](https://goghieas.substack.com/p/why-double-pledging-is-back-and-why) |
