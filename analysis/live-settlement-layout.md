# The live settlement layout

Records why the live settlement view is composed differently from the scripted walkthrough, and
what was removed from it. Written so the removals are not quietly restored by someone who assumes
they were an accident.

## The measurement

Taken from the rendered page, not estimated.

| | 1440×900 | 390×844 |
|---|---|---|
| page height | 2,885px | 3,713px |
| screens to scroll | 3.2 | 4.4 |
| left column height | 2,443px | 493px |
| left column *content* | 365px | 465px |
| left column dead space | **2,078px (85%)** | 28px |

Right-rail cards at 1440×900, cumulative from the top of the rail:

```
 465px  Protocol Phase            (cum  465)
 163px  Priority Engine Core      (cum  628)
 300px  Capital Waterfall Flow    (cum  928)
 306px  Settlement Activity       (cum 1234)   <- the only element that changes
 263px  Rank Order                (cum 1497)
 203px  Attestcoin Proof Pipeline (cum 1700)
 286px  On-chain Receipts         (cum 1986)
 137px  Verification Log          (cum 2123)   (0 events, on a live race always)
 192px  What happens next         (cum 2315)
```

**928px of static and decorative content sat above the only element that moves**, putting it below
the fold at 1440×900. A viewer waiting out the 6.5–9.3 minute attestation had to scroll to find the
one thing that would tell them the app was not hung, and lost sight of it the moment they scrolled
anywhere else.

## The cause

One layout was serving two different things.

A **scripted walkthrough** is a narrative: seven stages, complete in seconds, replayed at reading
speed with a spotlight. Its layout is a lane plus a rail of supporting panels, and that is right.

A **live settlement** is a monitor: one value changing over minutes, everything else fixed. Given
the narrative's layout it produces a lane with three cards and 2,078px of nothing, and a rail where
the live element is eighth of nine by prominence.

## Why not the obvious fixes

Each was considered and rejected on a specific failure, not on taste.

- **`position: sticky` on the activity panel.** Sticky does not pull an element up; it only holds
  one in place *after* it has been scrolled past. The panel starts below the fold, so on load
  nothing changes. Its containing block is also its own column, so it unpins as soon as that column
  ends — and at 306px on an 844px phone it would occupy 36% of the viewport permanently.
- **Tabs.** Hides the Attestcoin proof pipeline behind a click. "Depth of Attestcoin Protocol
  utilization" is an explicit scoring criterion, and a panel nobody opens scores nothing. It also
  breaks the one thing this page exists to show: lock → attestation → priority, in view together.
- **Accordion everything.** The page then loads as a stack of closed bars, which during a
  seven-minute wait gives no indication anything is running at all.
- **Masonry.** Packs by height, so the causal order — collateral, locks, attestation, priority,
  receipts — scrambles. And `SettlementActivity` legitimately changes height between stages, which
  in masonry reflows the other column under the reader's cursor.
- **A wizard showing only the current stage.** During the wait that is a single countdown in a void,
  and it hides the evidence a judge came to check.

All five are compensations for a page that is too long. The page should not be too long.

## What the live view does instead

```
SummaryHeader                                   (identity, KPIs, LIVE ON SEPOLIA)
LifecycleTimeline                               (7 stages, horizontal, 58px)
────────────────────────────────────────────────────────────────────────────────
SettlementActivity — FULL WIDTH                 what is happening, and what it waits for
────────────────────────────────────────────────────────────────────────────────
Rank order              │  Attestcoin proof pipeline
                        │  On-chain receipts        (folded, count shown)
                        │  Collateral & title       (folded)
```

Full width for the activity panel does two things at once: it cannot be below the fold at any
width, and its five metrics lay out as a horizontal strip instead of a five-row list, which makes
it *shorter* as well as more prominent.

Plain breakpoint grid flow. No nested scroll container — `overflow-y-auto` would clip the cards'
outer glow, and on touch it hijacks the page scroll. No container queries: they solve
component-internal reflow, not macro real estate.

## What was removed from the live view, and why

| Card | Height | Why it goes |
|---|---|---|
| Protocol Phase | 465px | Duplicates `LifecycleTimeline`, which renders the same stages horizontally in 58px directly above the grid. Eight of its ten rows are states a live race cannot reach for months. |
| Priority Engine Core | 163px | Decorative. It emits no block number, address or hash. It also *simulates* liveness — and now that a real heartbeat exists, a fake one beside it is worse than nothing. |
| Capital Waterfall Flow | 300px | **Wrong, not merely large.** It binds to `race.bids`, which is always empty on a live race because capital arrives as `race.locks`. It rendered "SENIOR · unfilled" directly above a rank card showing a real, funded SENIOR lock. |
| Verification Log | 137px | Its events come from the scripted orchestrator, so a live race shows "awaiting settlement events…" for its whole life, which reads as a broken connection. |
| What happens next | 192px | Written because there was no live panel. There is one now, and it says the same thing in the place the reader is already looking. |
| The replay lane | — | Its three live cards duplicate `SummaryHeader` and `ProvenOrder`. Removing it is what reclaims the 2,078px. |

Nothing is deleted from the scripted walkthrough. Both modes render from the same components; only
the composition differs.

## Result

Page height falls from 2,885px to roughly 1,000px at 1440×900 — from 3.2 screens to about 1.1 — and
from 4.4 screens to under 2 on a phone. The activity panel is above the fold on load at both sizes,
so the question the layout kept failing to answer ("is this still running?") is answered before any
scrolling happens.

## What this costs

1. **The two modes no longer share a container.** Anyone changing this screen has to look at both.
   Accepted: forcing them to share one is what produced the bug.
2. **Receipts are one click away** rather than in view. Accepted: they are audit artifacts, they
   stay complete and copyable, and the first lock's hash is still directly linked in the proof rail.
3. **On a phone the receipts are below the fold.** Accepted: the countdown and the rank order matter
   more on a 390px screen than 66-character hashes do.
4. **The live screen shows no placeholders for stages not yet reached.** Accepted: rendering a stage
   that has not happened is the thing this project must never do. The roadmap stays in the timeline.
