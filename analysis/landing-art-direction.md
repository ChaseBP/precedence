# Landing page — art direction

## 1. Evidence

| Screenshot | What is visible |
| --- | --- |
| `full__light__1440.png` | Six horizontal bands of near-identical height and identical internal rhythm. Measured in the browser: sections are 422 / 389 / 432 / 370 px tall — four sections within 62px of each other, each one heading (36px) → one-line deck → 32px gap → grid. The alternating tint (`--bg-0` #F4F5F8 vs `--bg-1` #FFFFFF) is a 1.5% luminance step; on screen it is faint, and the bands read as one column divided by hairlines. Below the hero there is not a single drawn mark. |
| `hero__light__1440.png` | Confirmed: header and hero inner edge at **x=168**; every section and the footer at **x=208**. Two left margins, and two right edges (1272 vs 1232). The hero band is 594px tall carrying 434px of content; the receipt column is `items-center`, so it floats 40px clear of the headline's cap-height and 136px clear of the band floor. Both CTAs are outline buttons — the "primary" is white with indigo text — while the solid indigo `CONNECT` in the header is the loudest object on the page. |
| `hero__dark__1440.png` | Structurally identical; dark is currently the *better* of the two because `--bg-1` reads as a genuinely raised surface against `--bg-0`, and the emerald `verified` and indigo indices have somewhere to sit. Light has no equivalent depth. |
| `full__light__390.png` | 4050px tall. The receipt — the strongest asset the project owns — begins around y≈650, roughly one screen *below* the fold on a 390×844 phone. The first screen is a headline, a paragraph, two stacked buttons and a disclaimer. The 5/2/2 deployed grid becomes three stacked lists and reads fine here; mobile is the one place that section works. |
| `hero__light__1920.png` | The margin split widens to 408 vs 448 and the hero's dead right-bottom quadrant grows with the viewport. |

## 2. The diagnosis

Three things stop this being world class, and only one of them is on your list.

**First: the page's only structural device does not survive its own demo.** Section differentiation is carried entirely by a #F4F5F8 → #FFFFFF tint alternation. Under a projector that difference is gone, and `full__light__1440.png` already shows it barely holding on a monitor. Everything else — heading size, deck length, grid gap, section height — is constant. Strip the tint and the page is one 2431px column with four hairlines in it. A reader scrolling has no landmark, no crescendo, and no reason to reach "What this does not claim". That is why it feels uniform; the grids are a symptom.

**Second: the argument is spatial and the page only ever says it in words.** "Two locks in one block, separated by transaction index alone" is a fact about *position*. The page states it four separate times in prose — headline, deck, receipt footer, mechanism card — and draws it zero times. Meanwhile this same codebase contains `ProvenOrder`, `ProofRail`, `CapitalFlowGraph` and `LifecycleTimeline`. The landing page is the only surface in the product that refuses to draw, and it is the surface talking to the person who has not yet decided the thing is real.

**Third: the call-to-action hierarchy is inverted.** In light, `.btn-accent` resolves to `rgba(255,255,255,0.8)`, so "Browse facilities" and "Register collateral" are two outline buttons distinguished only by text colour, while the header's wallet-connect is solid `--accent`. The single loudest element in the hero is a utility control.

On your suspicions: the two margins are real and worse than you thought (both edges, 40px, at every width). The 5/2/2 grid is real. "No diagram" is real and is the biggest one. But the receipt being *shorter* is not the problem — 354 vs 434px is fine; the problem is that `items-center` orphans it from the headline baseline and nothing occupies the band floor. And the footer is not one thin row: it is a 153px band holding 72px of content in three rows. It reads thin because it has no content of its own, not because it is short.

One outright violation found: `text-[0.62rem]` = **9.92px**, below your 10.5px floor, on the receipt caption and the truncated hashes.

## 3. Three directions

### A — The Reporter

The page is typeset as a law report: a narrow marginal column carries the verifiable citation — block height, transaction index, contract address — directly beside the sentence it supports. No cards anywhere; hierarchy comes from rule weight, indent and whitespace only.

**Hero becomes**

```
⟫ PRECEDENCE                        Facilities   Priority settlement   [○]
══════════════════════════════════════════════════════════════════════════
                  │
                  │   Priority goes to the transaction
  Sepolia         │   that landed first.
  block 11626711  │   ──────────────────────────────────────────────
  index 71 SENIOR │   Lenders compete to fund real-world collateral.
  index 72 JUNIOR │   Rank is decided by where each transaction
  ──────────────  │   actually landed in the block order.
  CC3   5423422   │
  proven at 0x0FD2│   [ BROWSE FACILITIES ]  [ register collateral ]
```

**Scroll becomes** one continuous ruled column at a single measure. Every factual claim in the body acquires a citation in the margin; the margin is the only place mono appears. Section headings are the sole large type, and rhythm comes from varying the *gap* before each heading (6rem, 3rem, 6rem) rather than from tinted bands.

**Risk** It is quiet. The sceptic gets authority but nothing to look at, and the marginal column has nowhere to go at 390px — the device that makes the direction disappears on mobile, so mobile becomes a different, weaker page.

### B — One Block

The page is built around a single drawing of Sepolia block 11626711 seen as a vertical index axis, with 71 and 72 filled and their neighbours ghosted. That figure is the hero, and the horizontal proof rail that runs beneath it becomes the recurring spine of the whole scroll.

**Hero becomes**

```
⟫ PRECEDENCE                        Facilities   Priority settlement   [○]
──────────────────────────────────────────────────────────────────────────
                                       SETTLEMENT RECORD        verified
 Priority goes to        ┌────────────────────────────────────────────┐
 the transaction         │  69   ·······················              │
 that landed first.      │  70   ·······················              │
                         │ ▐71   SENIOR   0x9608…3ae30        $5,100  │
 Lenders compete to      │ ▐72   JUNIOR   0x704a…8cc1b        $2,550  │
 fund real-world         │  73   ·······················              │
 collateral. Rank is     └───┬────────────────────────────────────────┘
 decided by where            └─ one block. one index apart.
 each transaction
 landed.                 Ethereum Sepolia  (simulated in this deployment)

 [ BROWSE FACILITIES ]  [ register collateral ]
──────────────────────────────────────────────────────────────────────────
 lock ●────────────[  attesting · 6.5–9.3 min  ]────────────● CC3 5423422
      t=0            measured over 239 samples               recorded
```

**Scroll becomes** four acts that reuse the rail: the paired mechanism block; the three-step sequence redrawn as three *stations on the same rail*, so step 2 carries a duration segment rather than a dot; the deployment register; the limits. Attestation is drawn as a segment with width — the honesty requirement expressed as geometry rather than as a sentence you have to trust.

**Risk** The figure has to be genuinely well-drawn or it looks like a diagram in a whitepaper. At 390px the vertical axis works but the horizontal rail must reflow to vertical without losing the "the wait has length" reading.

### C — Two Registers

The whole page is a held comparison on one shared spine: the filing office on the left, the chain on the right, row by row, from the hero to the footer. Same questions asked of both systems, answered in the same order, all the way down.

**Scroll becomes**

```
        THE FILING OFFICE          │        THE PROVEN ORDER
────────────────────────────────────────────────────────────────
 what decides priority             │
   a clerk's timestamp             │  ▐ block height, then index
────────────────────────────────────────────────────────────────
 when it is final                  │
   when the office says so         │  ▐ when the block was mined
────────────────────────────────────────────────────────────────
 who holds the record              │
   a third party, offline          │  ▐ Creditcoin CC3 · 5423422
```

**Hero becomes** the same split: headline on the left half in the muted voice, the settlement record on the right half in the loud one, the axis established on the first screen and never broken.

**Risk** Half the page is spent on a system that is not yours, the "vs" table is a familiar SaaS trope, and it invites rebuttal from precisely the lender who uses a registry today and does not think it is broken. It argues where the product should be exhibiting.

## 4. The recommendation

**Direction B.** The audience is a sceptic who has read a hundred protocol sites that assert. What this product owns that none of them own is a *spatial* fact — index 71 beat index 72 inside one block — and prose cannot deliver a spatial fact; it can only report one. B is the only direction where the reader *sees* the claim before reading it.

It also fixes the three real problems at once. It gives the page a second act with genuine visual weight, so the scroll has a shape. Its differentiation is line, position and whitespace, none of which a projector can flatten — unlike A, which leans on marginal whitespace, or the current tint. And it puts the app's own visual language on its front door, so the landing stops being the one surface in this product that does not draw.

A is more beautiful and less persuasive: it makes a quiet page quieter, which is the opposite of the diagnosis. C is the direction that most easily becomes marketing; B stays evidence.

## 5. The build spec

**Container — one measure, everywhere.** Delete the `max-w-6xl` / `max-w-5xl` split. Every band (`header`, hero, all four sections, `footer`) is: outer element carries background, top rule and vertical padding, full-bleed; inner element is `w-full max-w-[64rem] mx-auto`. Band horizontal padding `1.25rem` below 640px, `1.5rem` to 1280px, `2rem` above. At 1440 both edges land at 208 / 1232; the hero moves, nothing else does. One exception: the block figure's ruled ground may bleed to the band edge, but every glyph in it stays inside the 64rem measure.

**Spacing scale (rem).** `0.25 0.5 0.75 1 1.5 2 3 4 6 8`. Nothing off-scale.

Vertical rhythm, deliberately unequal — this is what replaces the tint as the differentiator:

| Band | pad-top | pad-bottom | Surface | Top rule |
| --- | --- | --- | --- | --- |
| header | 1 | 1 | `--bg-1` | — |
| hero | 3 | 4 | `--bg-1` | — |
| Two lenders, one block | 4 | 4 | `--bg-0` | 1px `--border` |
| How a facility works | 6 | 6 | `--bg-1` | 2px `--border-strong` |
| What is deployed | 4 | 4 | `--bg-0` | 1px `--border` |
| What this does not claim | 3 | 4 | `--bg-0` | 1px `--border` |
| footer | 3 | 3 | `--bg-1` | 2px `--border-strong` |

Two `--border-strong` rules on the page and no more. They bracket the figure act and open the footer; they are the landmarks a projector can still see.

**Token jobs.**

| Token | Job on this page — and nowhere else |
| --- | --- |
| `--bg-0` | connective ground (the three talking sections) |
| `--bg-1` | the two document surfaces: hero+figure act, footer |
| `--bg-2` | inset rows *inside* a figure — only ranks 71 and 72, and the deployed rows on hover |
| `--border` | hairlines, ghost index rows, table rules |
| `--border-strong` | the two act rules, and the receipt's outer edge |
| `--accent` | the transaction index numeral, and exactly one solid button |
| `--proof-verified` | the word `verified` and the settled node on the rail. Never a fill, never decoration |
| `--rank-senior` / `--rank-junior` | the 3px inset rule and the tranche label on rows 71 / 72 |
| `--rank-subordinate` | the ghost index rows 69, 70, 73 |
| `--text-faint` | hashes, index ticks, the `(simulated)` chip |

**Type.** `h1` `clamp(2.15rem, 1.2rem + 3.2vw, 3.4rem)` / 1.06. `h2` 1.75rem. Deck 0.95rem / 1.65, max 62ch. Body 0.875rem / 1.7, max 58ch. Data mono 0.75rem, index numeral mono 1.125rem semibold tabular. **Floor 0.6875rem (11px)** — raise the two `text-[0.62rem]` uses (receipt caption, truncated hash) and promote the footer testnet line from 0.66rem to 0.75rem body; it is the honesty statement, not fine print.

**Section by section.**

1. **Hero.** Two columns `1fr 1.05fr`, `align-items: start`, headline cap-height and figure caption on the same baseline. Gap 3rem. Below both, spanning the full measure, the proof rail — it gives the band a floor and removes the 136px dead quadrant. CTAs: primary uses `.btn-primary` (solid `--accent`, `--on-accent` text — already in `globals.css`, no CSS change needed) instead of `.btn-accent`; header `CONNECT` drops to `.btn-ghost` on this route only.
2. **Two lenders, one block.** Not two equal cards. One block, split 42/58: the registry side on `--bg-0` at `--text-muted`, the chain side on `--bg-1` with the existing `inset 3px 0 0 var(--accent)` rule. Asymmetry does the work the tint used to.
3. **How a facility works.** Three stations on one horizontal rail, index ticks below it, not three text columns. Station 2 carries the measured segment. Below 900px the rail rotates to vertical and the segment becomes a vertical length — the wait must stay a *length* at every width. This is the one legitimate 1/2/3 sequence on the page; nothing else gets numbers.
4. **What is deployed.** Kill the 5/2/2. Two columns, 38/62: Creditcoin CC3's five rows fill the left; Sepolia (2) and precompiles (2) stack in the right, and the space that a "trusted by" row would occupy takes the honest equivalent — the measurement block: `239 samples`, `p50 7.8 min`, `2 later locks returned in full`, and one plain line reading "Testnet. Not audited. Sepolia is simulated in this deployment; Creditcoin CC3 is live." That is the credibility content, and it is stronger than a logo wall because it can be checked.
5. **What this does not claim.** Not three columns. A full-measure ruled list: claim in a 24ch left column, qualification in the remainder, `--border` rule between rows. Fourth distinct shape on the page.
6. **Footer.** ~12rem, three columns on the same measure: wordmark and one line; product links; and a **Verify** column — direct explorer links to Sepolia block 11626711, Creditcoin CC3 block 5423422, and `0x0FD2`. A footer whose own content is verification.

**Motion — exactly two moments.**
- Rows 71 and 72 arrive in proven order: opacity 0→1, y 6→0, 0.35s, delays 0.45s and 0.9s, `cubic-bezier(0.16, 1, 0.3, 1)`. Existing; keep verbatim.
- The attestation segment draws once when the rail crosses 50% of the viewport: `scaleX 0→1`, `transform-origin: left`, 0.7s ease-out, `once: true`.

Collapse the hero's four staggered rises to two groups (text at delay 0, figure at 0.1s). No entrance animation on any section. **Reduced motion:** both rows already in final position, segment already at `scaleX(1)`, hero groups static — the page loses no information, only the two seconds of choreography. Hover and focus transitions are user-initiated and stay.

## 6. What must not change

1. **Leading with the real settled race.** Block 11626711, indices 71 and 72, every figure linking to a public explorer. This is the entire argument and no competitor can copy it without doing the work. A redesign that turns it into an illustration instead of a live-linked record destroys the page.
2. **The clipped-corner mono button language.** `--cut: 10px`, the diagonal hairline, mono caps. It is specific to this product and reads as instrumentation, not as a template. Do not round it, do not append an arrow, do not sentence-case it.
3. **Mono as load-bearing, and hashes never mangled.** Block heights, indices and amounts are the product, so they hold the mono voice with `tabular-nums`. Keep the `0x0FD2` special case that stops a precompile constant being truncated into `0x0000…0FD2`.
4. **"What this does not claim", above the footer, at body size.** Three named limits including the 6.5–9.3 minute wait. Shrinking it, moving it below the fold of the footer, or softening the language is the one change that would make this page worse in a way no visual gain repays.
5. **The ordinal rank ramp doing its own job.** Seniority must remain readable from colour alone; the light-theme alpha steps were widened specifically to make that true and must not be re-flattened.
6. **`--proof-verified` reserved for verified state.** One `verified` word and one settled node. The moment emerald becomes decoration, the page can no longer tell a reader that something has actually been proven.
