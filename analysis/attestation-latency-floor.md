# Why settlement cannot be faster than ~6.4 minutes

Re-measured 2026-09-04 after the question "transactions shouldn't take 6-9 minutes, at most 2
minutes is the maximum possible time — find out the issue."

The answer is that our transactions are not the 6-9 minutes. They are ~73 seconds in total. The
6-9 minutes is one wait — the Attestcoin attestation frontier reaching the Sepolia block that
contains the lock — and it is a property of the Attestcoin network, not of this codebase.

## Our own transactions, timed live

| transaction | measured |
| --- | --- |
| CC3 `registerCollateral` | 1.5s |
| Sepolia `registerCollateral` | 12.8s |
| Sepolia `openRace` | 13.1s |
| Sepolia `mintDollars` (faucet) | 25.0s |
| Sepolia `approve` | 11.7s |
| Sepolia `lock` | 10.5s |

**~73s for the whole five-signature user path**, already inside a 2-minute budget.

## The frontier, re-measured

41 samples at 15s intervals, 2026-09-04T10:13:09Z → 10:22:58Z
(`evidence/attestation-frontier-gap.jsonl`):

- gap behind Sepolia head: **min 32, max 42, mean 37.2 blocks**
- age of the newest attested block: **6.90 – 9.35 min** (mean 8.16)
- advances in **exactly 10-block batches**, at 59s / 118s / 147s / 134s intervals
- the gap snaps back to 32-33 after each batch and **never closes below 32**

This reproduces the 2026-09-02 figure (6.5-9.3 min, n=239) almost exactly, so the cadence is
stable — not a drift, an outage, or a condition that can be waited out.

**32 blocks x 12s = ~6.4 min is therefore a hard floor** for a freshly-mined Sepolia lock.

## Six causes ruled out, with the measurement that ruled each out

1. **Ethereum finality.** No. The frontier sat 20 blocks *ahead* of Sepolia's justified (`safe`)
   block and 52 ahead of `finalized`. Attestcoin attests unfinalised blocks, so consensus is not
   the constraint.
2. **Our polling interval.** No. `waitForAttestation` polls at 15s and returns on the first
   satisfying read, so we contribute at most 15s.
3. **A fixed sleep in our code.** No. `MEASURED_ATTESTATION_LAG.demoStagingMinutes = 12` is
   guidance in a docs constant and appears in no code path.
4. **Reading the wrong frontier.** No. The *checkpoint* frontier was 187 blocks / 38.5 min behind.
   Attestation is already the faster of the two.
5. **A faster source chain.** No. Only two chainKeys return `exists = true` (1 = Sepolia, 3 = one
   other, advancing 10 blocks per 141s). There is nowhere faster to move the locks.
6. **Us being needlessly conservative in requiring attestation.** No, and this is decisive. A lock
   was sent and its block queried immediately, 43 blocks past the frontier. The proof builder
   returns **HTTP 404**. A proof cannot be constructed before the block is attested, so the wait
   cannot be skipped by being braver about it.

## What follows

Settlement itself is fast: once the block is attested, verify-and-settle is one CC3 transaction,
and CC3 confirms in 1.5s. A race whose locks are already past the frontier settles in about two
seconds.

So the fix is sequencing, not speed. Do not put the attestation wait on the demo's critical path:
stage the locks ~10-12 minutes ahead (what `demoStagingMinutes` is for) and the settlement a judge
watches is effectively instant.

**Open gap.** The UI shows a static `PENDING_EVIDENCE` badge with the measured range hard-coded in
a comment. Nothing reads the *live* frontier, so a fresh lock looks like a hang for seven minutes
with no sign of progress. A block countdown driven by the real frontier would make it read as a
known protocol property instead of a stall.

---

## Which side is the bottleneck: Attestcoin or Creditcoin?

Measured 2026-09-05, because "it takes seven minutes" is not the same claim as "our chain is slow".

### Creditcoin is idle the whole time

```
block time             ~15.0s
txs in last 12 blocks   26
gas used / limit        11,480,102 / 900,000,000  = 1.28% full
```

Watching the frontier advance against both chains' clocks:

```
+10 sepolia blocks after  39s  (=3 CC3 blocks elapsed)  · 32 behind head
+10 sepolia blocks after 135s  (=9 CC3 blocks elapsed)  · 32 behind head
+10 sepolia blocks after 123s  (=8 CC3 blocks elapsed)  · 33 behind head
+10 sepolia blocks after 112s  (=8 CC3 blocks elapsed)  · 32 behind head
```

Between attestation batches Creditcoin produces eight or nine blocks that are ~99% empty. It has
900M gas per block and is using 11M. **Creditcoin contributes one block — about 15 seconds — to a
seven-minute wait, roughly 3%.**

### It is not Ethereum finality either

The docs say attestors monitor for "new finalized blocks", which would put the floor at Ethereum's
finality gadget. Measured over 62 samples spanning two Sepolia epochs, that is not what happens:

```
attested - finalized       min +25   max +57   mean +39     (ahead in 62/62 samples)
attested - safe/justified  min  -6   max +25   mean  +8.3   (ahead in 49/62)
head - attested            min  32   max  42   mean  37
frontier advanced 6 times while `safe` advanced 2 times
```

The frontier moved three times as often as the justified checkpoint. If attestation were gated on
justification it could only advance when `safe` advances. It is running on its own cadence, ahead
of both justified and finalized.

**This is worth stating plainly: Attestcoin attests Sepolia blocks that Ethereum has not
finalized.** The ~32-block depth is a heuristic confirmation margin, not a finality guarantee, so
a reorg deeper than that margin but shallower than finality would invalidate an attestation. That
is a property of the system this protocol sits on, and it belongs in the honest-limits list rather
than in a footnote.

### The decomposition

| Component | Contribution | Whose |
| --- | --- | --- |
| ~32-block confirmation margin before a block is attested at all | ~6.4 min | Attestcoin, configured |
| Waiting for the next 10-source-block attestation batch | 0–2.0 min | Attestcoin, configured |
| Creditcoin including the attestation | ~0.25 min | Creditcoin |

The 10-block batch is documented: *"if the attestation interval for Ethereum is 10, a new
attestation is produced on Creditcoin for every 10 blocks on Ethereum"* — a per-chain cost
optimisation, chosen because "storing attestations for every source chain block would be too
expensive" and attestors must sign, gossip and submit for each one.

**Answer: Attestcoin, and by configuration rather than by throughput.** It keeps pace exactly —
ten Sepolia blocks arrive every 120s and it attests ten every ~120s — it simply never closes the
standing gap. Nothing on our side, and no amount of Creditcoin capacity, changes either parameter.
