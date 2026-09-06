# Landing page — design plan

The position this rebuild was argued from, recorded before the critique it was weighed against so
the two could be compared rather than one simply adopted.

## Subject, audience, job

**Subject.** Lien priority for real-world trade collateral, decided by proven block position.

**Audience.** Someone deciding whether this is real — a lender or borrower first, a judge second.
Both are sceptical, and both have seen a hundred protocol sites that assert rather than show.

**Job of the page.** In about twenty seconds, make it clear that priority here is settled by
something the reader can go and verify, not by a claim the site is making about itself.

## The one idea

The page should open with **the receipt**, not a slogan about the receipt.

There is a real settlement in `evidence/race-88857090.json`:

```
Sepolia block 11626711   txIndex 71   ->  SENIOR
Sepolia block 11626711   txIndex 72   ->  JUNIOR
```

Two locks in **one block**. Only the transaction index separates them. That single artefact is the
entire argument — it is what an oracle cannot commit to and a filing office cannot adjudicate — and
it is currently nowhere on the landing page. Settled on Creditcoin CC3 at block 5423422, proven at
`0x0FD2`, every hash resolvable on a public explorer.

Everything else on the page is support for that.

## Colour — roles, not new values

The palette is final. What changes is which token does which job:

| Token | Role on this page |
| --- | --- |
| `--bg-0` | page ground |
| `--bg-1` | the raised document surface the receipt sits on |
| `--bg-2` | inset rows inside the receipt, so data reads as data |
| `--accent` | one action, and the proven index — nothing else |
| `--proof-verified` | verified state only, never decoration |
| `--rank-senior` / `--rank-junior` / `--rank-subordinate` | tranche identity, ordinal by design |
| `--border` / `--border-strong` | hairlines, and the document edge |

Three visible surface levels where the page currently has roughly one. Depth is most of what
separates a product site from a slide.

## Type

Poppins display, DM Sans body, IBM Plex Mono data — fixed. The distinctive move is in how mono is
used.

On most sites a monospace face is decoration for small labels, which is a generated-design tell.
Here it is **load-bearing**: the block height and the transaction index *are* the product. Mono
carries the argument, and prose gets out of its way. That is a choice this subject earns.

Scale, replacing the current two-step jump from an enormous wordmark to one body size:

| Step | Use |
| --- | --- |
| Display | the claim, one per page |
| Section | section headings |
| Subhead | section decks, larger body |
| Body | prose, measure capped near 72 characters |
| Small | captions, document labels |
| Mono | every number that came off a chain |

## Layout

Asymmetric, not centred. The current page puts logo, wordmark, paragraph, button, links and a
ticker on one centre axis inside a single viewport — which is why it reads as a splash rather than
a site.

```
+-------------------------------------------------------------------+
| nav                                                               |
+---------------------------------+---------------------------------+
| Priority goes to the            |  SETTLEMENT RECORD              |
| transaction that landed         |  Sepolia block 11626711         |
| first.                          |  +---------------------------+  |
|                                 |  | idx 71   SENIOR   $5,100  |  |
| Not to whoever filed first.     |  | idx 72   JUNIOR   $2,550  |  |
|                                 |  +---------------------------+  |
| [ Open the registry ]           |  proven 0x0FD2 - CC3 #5423422   |
+---------------------------------+---------------------------------+
|  filing order  ->  proven order   (the mechanism, side by side)   |
+-------------------------------------------------------------------+
|  how a facility works   1 post terms  2 lenders race  3 settles   |
+-------------------------------------------------------------------+
|  what is deployed - real addresses, both chains, honest labels    |
+-------------------------------------------------------------------+
|  what this does not claim                                         |
+-------------------------------------------------------------------+
|  footer                                                           |
+-------------------------------------------------------------------+
```

Left-aligned, ragged right, in both hero columns. Centred type is why the current page reads as a
title card.

## Principles

1. **Spend the boldness on the receipt.** One memorable artefact; everything around it quiet.
2. **Mono is evidence.** If a number is on the page it came off a chain, or it is visibly labelled
   a sample.
3. **Show the mechanism before explaining it.** The comparison section is the caption, not the
   headline.
4. **One orchestrated moment.** The two same-block rows resolve into their proven order, once, on
   load. Under `prefers-reduced-motion` they are simply already ordered.
5. **Keep the honesty furniture.** The simulated/live badge and the measured latency range stay
   visible. On this page they are credibility, not disclaimers.

## Reviewed against the brief for genericness

Working through the same prompt generically would produce: a near-black hero with an acid accent, a
gradient wash, a centred headline with one word coloured, a row of big-number stat tiles, a
three-card "features" grid, and a fade-up on every section. Checked against that:

- **Near-black + acid accent** — no. Light default, indigo, already unlike the category.
- **Gradient wash as decoration** — none.
- **Coloured word in the headline** — explicitly removed; the current wordmark's indigo `P` goes.
- **Big-number stat row as the hero** — rejected. The receipt is more specific and it is true.
- **Identical rounded cards** — the receipt is one distinct artefact; the sections below differ in
  shape from each other on purpose.
- **`01 / 02 / 03` markers** — used in exactly one section, "how a facility works", which is an
  actual sequence. Justified rather than decorative.
- **All-caps label above every heading** — the app leans on `.eyebrow` heavily. On this page one
  survives: `SETTLEMENT RECORD` above the receipt, because a caption on a document is the
  vernacular of the subject, not template chrome.
- **`->` appended to buttons** — dropped.

The one thing I would defend as a risk worth taking: leading a finance product with a raw
transaction index. It is less immediately legible than a headline about unlocking liquidity, and it
is the only thing on the page that no competitor can copy without doing the work.
