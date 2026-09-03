# Evidence

Each `race-*.json` is a real settlement, captured by `worker/src/settle-race.ts` from chain reads
rather than assembled by hand.

## Which run is current

**`race-88857090.json` — 2026-09-03, the current one.** Deployment:
Sepolia vault `0x000d8d9C5Ab3b3d98A574eCEB34136e885C16656`, CC3 gate
`0x1E6713DdF4a2D90fb871EF545941b3f190099153`. Settled in CC3 block 5423422 for 1,177,620 gas,
after a 6.37-minute attestation wait.

Two things this run demonstrates that the earlier one could not:

- **Same-block contention at consecutive transaction indices** (block 11626711, txIndex 71 and
  72). Block height cannot separate those two locks, so priority is decided entirely by
  `calculateTxIndex` deriving position from the Merkle path. All four derived indices match what
  the block explorer independently reports.
- **Demotion consent, honoured identically on both chains.** `0x8E83a933…` bid $4,000 SENIOR and
  opted into demotion *in its own lock transaction*. Outpaced for SENIOR, it cascaded into JUNIOR
  ($2,550) and SUBORDINATE ($850), taking that capacity ahead of the financiers who had bid
  specifically for those tranches — because its lock was proven earlier. $600 came back.

The allocations were then read off both chains and compared:

| Lock | Financier | Sepolia vault | Creditcoin engine |
| --- | --- | --- | --- |
| 0 | `0x537fC713…` | $5,100.00 | $5,100.00 |
| 1 | `0x8E83a933…` | $3,400.00 | $3,400.00 |
| 2 | `0x4f3F6012…` | $0.00 | $0.00 |
| 3 | `0x78a5C38c…` | $0.00 | $0.00 |

## `race-bd830e85.json` — SUPERSEDED, kept as history

The first end-to-end settlement, against the previous deployment (vault
`0x5EdaD363…`, gate `0x9095626d…`). Its Creditcoin side is correct and its ordering cross-check
holds — that part is genuine. But its **Sepolia side allocated by a different rule**: the vault
then filled locks by array index against the facility total, with no notion of tranches, so it
disagreed with the engine on three of four locks. Reading `allocatedAmount` on that vault today
still returns the old, divergent numbers.

It is kept rather than deleted because it is real history and deleting inconvenient evidence is
its own kind of dishonesty. It should not be quoted as current. The divergence, its consequences
and the fix are written up in `analysis/allocation-divergence.md`.

## Other files

- `precompile.json` — live checks against `0x0FD2` and `0x0FD3` over direct RPC.
- `latency.jsonl` (gitignored, large) — continuous attestation-lag samples;
  `ops/measure-latency.ts --summary` reports the distribution.
