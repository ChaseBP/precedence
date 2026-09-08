# PRECEDENCE — demo script

**5:00 is the hard ceiling. Expect to land around 4:40.**

The spoken lines come to 533 words — about **3:40** at a normal 145 words a minute, or 3:57 if you
take it slowly. The remaining minute is on-screen action: signatures landing, a page settling, an
explorer opening. That part is yours to compress in the edit, which is why the speech is short
rather than filling the whole five minutes.

Everything in *italics* is a screen direction — don't read it. Everything in plain text is meant to
be said out loud, and is written to be said rather than recited: short sentences, contractions,
one idea at a time. Read it once through before recording so the rhythm is yours.

---

## Before you record

**Stage two facilities, not one.** The proof needs its source block attested, which takes 6.5–9.3
minutes and cannot be hurried.

- **Facility A** — run the whole flow ~15 minutes before you start recording, and leave it sitting
  at *Attested · the proof can be submitted*. This is the one you press the button on.
- **Facility B** — fresh. You'll register, open and lock this one on camera.

**Have the receipt text on your clipboard**, or in a scratch file you can copy from. Section 3 opens
with you pasting it and the model filling the form, so fumbling for the text kills the first beat.
`PRECEDENCE_RUNTIME=agent` and `GEMINI_API_KEY` must both be set on the Azure box or the parse
returns `available: false` and the form stays empty. Verified working on the live deployment.

A receipt that reads cleanly, if you want one — this exact text returned every field correct at 0.95
confidence with no concerns flagged:

```
Warehouse Receipt WR-2026-441. Custodian: Antwerp Bonded Storage, Antwerp, Belgium.
Obligor: Northwind Metals Ltd. Commodity: 40 tonnes copper cathode.
Declared value USD 480,000. Term: 90 days.
```

Use your own if you prefer — a messier one is arguably a better demo, since the concerns list is
then doing visible work.

Have these open in tabs, in order:

1. `https://precedence-beige.vercel.app` — the landing page
2. The facility page for **B**
3. The settlement page for **A**, showing PROOF_READY
4. `sepolia.etherscan.io` — blank
5. `creditcoin-testnet.blockscout.com` — blank

MetaMask unlocked, on Sepolia, holding test pUSD and a little Sepolia ETH. Second wallet ready if
you want to show two lenders competing.

---

## 1 · The problem — 0:00 to 0:30

*Landing page, top. Don't scroll yet.*

Two lenders fund the same warehouse receipt, ninety seconds apart. One of them is senior — paid
first if the borrower defaults, and lending cheaper because of it.

Today that's settled by filing order: whichever lender's paperwork reaches the registry first is
treated as first in line, days after the money moved.

PRECEDENCE settles it by where each lender's transaction actually landed on chain, proven
cryptographically, at the moment it happened.

---

## 2 · The claim, on a real settlement — 0:30 to 1:15

*Scroll to the settled record. Let the block figure sit on screen.*

This is a real settlement from our deployment. Two lenders, and both of their locks landed in the
**same Sepolia block**.

*Point at 71 and 72.*

Sharing a block means block height can't order them. What orders them is the transaction index
inside that block — seventy-one and seventy-two. Seventy-one takes senior, seventy-two takes junior.

*Click through to Etherscan.*

Both indices come from Ethereum, and you can read them off the public explorer. We don't assign
them — we prove them, and allocate the tranches in that order.

---

## 3 · Doing it live — 1:15 to 2:55

*Facility B. Register collateral. Paste the receipt text into the document box.*

So here it is live. I'm registering a warehouse receipt, and rather than typing the fields I'll
paste the document text straight in.

*Let the AI fill the form. Point at the filled fields and the confidence.*

A model reads it and fills the form — asset type, custodian, face value, term — with a confidence
score and anything it's unsure about.

But it only fills the form. It signs nothing and decides nothing; I check every field and I sign it.
Ranking and settlement are deterministic — no part of them depends on a model.

*Sign. Show the two CC3 receipts.*

Two real transactions on Creditcoin — the lien record, and the tranche terms lenders bid into.

*Claim and open.*

Now I claim the asset on the Sepolia vault and open a financing window. That's where capital
actually locks.

*Lock as a lender. Let the receipt land.*

And as a lender, I lock. Watch what comes back — the block, and the index inside it. That pair is
my priority claim. Not when I clicked. Where my transaction landed.

*Point at the OBSERVED badge.*

The ranking's already visible — but the badge says **observed**, not proven. Right now that's our
reading of Sepolia. It isn't evidence yet.

---

## 4 · The wait, and why it's honest — 2:55 to 3:35

*Close the race. Then the settlement activity panel, on the attestation numbers.*

I close the window, and now we wait — for Attestcoin.

*Point at the frontier figures.*

These are live. Attestcoin has attested up to this height; my block is here. That gap is the
remaining wait, read off the ChainInfo precompile at oh-F-D-three.

It advances in ten-block batches, so it moves in steps. End to end we measure six and a half to
nine minutes across two hundred and thirty-nine samples — measured, not quoted from a spec.

Nothing in our app makes it faster, and Creditcoin is idle throughout. So we show it rather than
hide it.

*Cut here. Switch to Facility A.*

---

## 5 · The proof — 3:35 to 4:20

*Facility A, at PROOF_READY. Press Submit the proof.*

Here's one where attestation has finished. Everything the proof needs now exists, so I submit it.

*Let the stages run.*

One Creditcoin transaction — a Merkle proof per lock, plus one shared continuity proof covering up
to ten locks in a single call. And the precompile at oh-F-D-two doesn't take our word for the
position; it re-derives the transaction index from the Merkle path itself.

*The badge flips.*

There — observed became **proven**, in one Creditcoin block.

*Open the CC3 transaction on Blockscout.*

And we cross-check it against the explorer. Every settlement records whether the two agree.

---

## 6 · The limit — 4:20 to 4:40

*Back on the settlement page, calm.*

One limit we're careful about. This proves **ordering**, not authenticity. If a custodian issues two
receipts for one pallet, block ordering won't catch that. What we prevent is the same registered
claim being financed twice, or out of order.

Priority goes to the transaction that landed first, proven on Creditcoin.

---

## Cut list

- The attestation wait in section 4 — say the line, cut to Facility A.
- MetaMask confirmation dialogs — trim to the signature and the result.
- Any RPC hesitation while a receipt lands.

**Do not cut:** the transaction index numbers, the OBSERVED badge, the badge flipping to PROVEN, or
a single explorer click. Those four are the demo.

---

## If it breaks on camera

- **A lock reverts** — you're past the deadline. Open a new window on the same facility and lock
  again; say the vault rejected it, which is the correct behaviour.
- **The prover fails** — read the message aloud, it names the cause. "Already settled" and "not
  registered on Creditcoin" are both refusals before spending gas, which is a point in your favour.
- **A page looks stale** — it polls every twenty seconds and pauses in a hidden tab. Click back into
  it and it catches up.

---

## Numbers you may be asked, and the honest answers

| Question | Answer |
|---|---|
| Why so slow? | Attestcoin's attestation cadence — 32 to 42 blocks behind Sepolia head, in ten-block batches. Measured 6.5–9.3 min, p50 7.8, n=239. |
| Is that Creditcoin's fault? | No. Creditcoin sits at about 1.3% gas utilisation and contributes roughly fifteen seconds of it. |
| So "one block" is a stretch? | "One block" covers verification plus the state transition, after the proof exists. We never claim the proof is instant. |
| What if two locks land in one block? | That's the case the whole design exists for — `calculateTxIndex` resolves it, and section 2 is a real example. |
| Who can settle a race? | Anyone. Closing the window is permissionless once the deadline passes, and so is proving it. |
| Where's the state? | Sepolia and Creditcoin. Our store is a cache — a settlement can be rebuilt from the vault alone. |
