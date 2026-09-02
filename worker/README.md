# PRECEDENCE readability worker

The off-chain half of the Attestcoin integration: it proves Sepolia locks and settles priority on
Creditcoin.

Runs as a separate process from the Next.js app for two reasons — `@gluwa/usc-sdk` requires
**ethers v6** while the app uses **viem**, and the worker waits ~8 minutes for attestation, which is
not a serverless shape.

```bash
bun install
bun test                                  # 20 tests over the pure logic
bun run src/cli.ts status                 # chain + attestation + deployment health
bun run src/cli.ts probe <txHash…>        # prove real Sepolia txs end-to-end, no deployment needed
```

Env comes from `../.env.local`. Contract addresses come from `../contracts/deployments/*.json`,
written by the deploy scripts — never hand-typed, because a mistyped vault address silently breaks
the proof-to-vault binding and the failure looks like a verification error.

## The pipeline

| Stage | Cost | What it does |
| --- | --- | --- |
| 1. receipts | instant | fetch source receipts; **reject `status != 1`** — the precompile does not check this |
| 2. `waitUntilHeightAttested` | **6.5–9.3 min, measured** | the honest wait. `PENDING_EVIDENCE`, not an error |
| 3. `getBatchProof(txHashes)` | seconds | ≤10 txs, **one shared continuity proof**, 1000-block window |
| 4. `verify(...)` view-only | **free** | preflight, so a malformed batch costs no gas |
| 5. `settleRace(...)` | one ~15s block | **one batch `verifyAndEmit`** settles the whole race |

"One block" refers only to stages 4–5. Stage 2 is minutes and is never hidden.

## Commands

| Command | Purpose |
| --- | --- |
| `status` | both chains, attestation lag, signer balances, deployed addresses |
| `probe <txHash…>` | end-to-end proof-path probe against existing txs — **needs no deployment** |
| `locks <collateralId>` | read a race's locks from the vault, in proven order |
| `prove <collateralId> --from-vault` | prove and settle a race, reading its locks from the chain |
| `repay <collateralId> <txHash>` | prove a repayment, release the lien against the decoded amount |
| `watch <collateralId…>` | poll for closed races and auto-settle |
| `facility <collateralId>` | facility state, PCR, and which keeper poke is next |
| `poke <collateralId>` | call the next available poke |
| `unwind <collateralId>` | drive the whole failure branch |
| `keeper <collateralId…>` | run the keeper loop |

## Two things worth knowing before changing this

**`flattenBatchProof` is the fiddly part.** `getBatchProof` returns `merkleProofs` as a nested
`Map<height, Map<txIndex, entry>>`, which is convenient for lookup and useless for a contract call.
Two things must hold, and neither is checkable on-chain:

- **Sorted by `(height, txIndex)`.** The gate requires strictly increasing proven order and reverts
  otherwise, so map-iteration order would fail intermittently depending on insertion order.
- **Index-aligned arrays.** `heights[i]`, `encodedTxs[i]` and `merkleProofs[i]` must describe the
  same transaction. A misalignment would verify a real transaction against the wrong height and
  fail confusingly.

**The keeper is a convenience, not a dependency.** Every function it calls is permissionless and
gated only on a block timestamp or an absent proof. If this process is dead the protocol still
protects lenders — someone else pokes and collects the bounty. The keeper key holds no privileges at
all, which is checkable on-chain and is why it was generated separately from the deployer.

## Verified against the live services, 2026-09-01

`bun run src/cli.ts probe` on three real Sepolia transactions, with nothing deployed:

```
[receipts]    all status 1 · blocks 11613749–11613751
[attestation] latest attested 11617610 · 44 blocks / 9.2 min behind head
[proof]       getBatchProof OK · headers 11613749–11613751
              ONE continuity proof, 52 roots
[flatten]     3 proofs, index-aligned, proven order 11613749:102 → 11613750:131 → 11613751:163
[txIndex]     calculateTxIndex at 0x0FD2 on the REAL Merkle proofs:
              precompile 102 · chain 102 · AGREE
              precompile 131 · chain 131 · AGREE
              precompile 163 · chain 163 · AGREE
[verify]      PrecompileBlockProver.verifyBatch → true
[cost]        ~3.81e-5 CTC
```

The `calculateTxIndex` rows are the protocol's whole thesis in one measurement: **given only the
Merkle path, the precompile derives the canonical transaction position, and it matches what the
chain independently reports.** An oracle can assert an ordering; this one is proven. Full record in
`../evidence/proof-path-probe.json`.
