# The vault and the engine disagreed about who is owed what

**Found 2026-09-03**, while wiring the borrower's servicing panel and reading `allocatedAmount`
off the live Sepolia vault for the first settled race (`0xbd830e85…`).

## The two answers

`PriorityEngine` on Creditcoin allocates **tranche-aware**, walking locks in proven
`(block, txIndex)` order and seating each in its declared tranche up to that tranche's posted cap
(`AllocationLib.allocate`). `PriorityVault` on Sepolia allocated **tranche-blind**, filling locks
by array index up to `facilitySize` alone (`allocatedAmount`). Same money, two rules.

Live figures from the settled race — facility $8,500, caps 5,100 / 2,550 / 850:

| # | Financier | Creditcoin award | Vault `allocatedAmount` |
| --- | --- | --- | --- |
| 0 | `0x8E83a933…` | SENIOR $5,100 | $5,100 — agrees |
| 1 | `0x537fC713…` | **refunded $5,100** | **$3,400** |
| 2 | `0x4f3F6012…` | JUNIOR $2,550 | **$0** |
| 3 | `0x78a5C38c…` | SUBORDINATE $850 | **$0** |

## Why it matters

1. **A lender could be paid twice.** `refund` returns `amount - allocated - refunded`. For locks 2
   and 3 the vault says `allocated == 0`, so both could withdraw their full principal *while still
   holding an ACTIVE claim on Creditcoin* entitled to repayment through the waterfall.
2. **A refunded lender could not get their money back.** Creditcoin refunded lock 1 in full, but
   the vault credits it $3,400 of allocation, so only $1,700 is reclaimable. $3,400 sits against a
   facility that lender holds no claim on.
3. The obligor's total drawable ($8,500) happened to be right, which is exactly why nothing looked
   broken.

## Why the tests missed it

`contracts/test/` covers the vault's allocation and the engine's waterfall **separately**. Both
were correct against their own specifications. Nothing asserted the two agree, and they are two
implementations of one decision.

## The fix

Give the vault the per-tranche caps at `openRace` and make `allocatedAmount` run the same
tranche-aware walk the engine runs. Lock order is already the proven order — the vault appends
locks in execution order, which *is* `(block, txIndex)` order — so with the same caps and the same
algorithm both chains reach identical allocations from identical inputs, and no reconciliation
between them is needed.

The vault's walk assumes **no demotion**, which is the conservative case and matches what the
worker submits by default.

## A related issue, deliberately NOT fixed here

`AttestationGate.settleRace(collateralId, proof, allowDemotion[])` takes demotion consent as a
**prover-supplied parameter**. So a third party choosing to prove a race also chooses whether each
financier consented to being demoted into riskier paper. Consent belongs to the financier, and the
natural place to record it is `PriorityVault.lock` — carried in the `Lock` event and read back from
the proven lock. That is a wider change (it touches the event, the proof library and the gate) and
is filed separately rather than bundled into this one.
