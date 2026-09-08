# PRECEDENCE — demo script

**Target 4:30 spoken. 5:00 is the hard ceiling.** 654 words — that's 4:31 at a normal 145 words a
minute, and 4:51 if you take it slowly. The margin is deliberate: on-screen pauses always cost more
than you expect, and rushing this material is what makes it sound rehearsed.

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

Have these open in tabs, in order:

1. `https://precedence-beige.vercel.app` — the landing page
2. The facility page for **B**
3. The settlement page for **A**, showing PROOF_READY
4. `sepolia.etherscan.io` — blank
5. `creditcoin-testnet.blockscout.com` — blank

MetaMask unlocked, on Sepolia, holding test pUSD and a little Sepolia ETH. Second wallet ready if
you want to show two lenders competing.

---

## 1 · The problem — 0:00 to 0:35

*Landing page, top. Don't scroll yet.*

Two lenders fund the same warehouse receipt, ninety seconds apart. Which one is senior?

Today a filing office decides that, days later, from paperwork. It's a race — but an
administrative one, and the answer arrives long after the money moved.

We think the chain already knew. It knew the moment those two transactions landed.

---

## 2 · The claim, on a real settlement — 0:35 to 1:20

*Scroll to the settled record. Let the block figure sit on screen.*

This is a real settlement on our deployment. Both of these lenders landed in the **same Sepolia
block**.

*Point at 71 and 72.*

Same block — so height alone can't separate them. What separates them is the transaction index.
Seventy-one takes senior, at the cheapest rate. Seventy-two takes junior.

*Click through to Etherscan.*

And that's not our number. It's Ethereum's — you can read it off the explorer right now.

Nobody decided this. The ordering was a fact about a block before either lender knew they'd won.

---

## 3 · Doing it live — 1:20 to 2:35

*Facility B. Register collateral.*

So here it is live. I register a warehouse receipt — the document hash and the tranche terms go
onto Creditcoin as the lien record.

*Sign. Show the two CC3 receipts.*

Two real transactions on Creditcoin, both clickable.

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

## 4 · The wait, and why it's honest — 2:35 to 3:20

*Close the race. Then the settlement activity panel, on the attestation numbers.*

I close the window, and now we wait — for Attestcoin.

*Point at the frontier figures.*

These are live. Attestcoin has attested up to this height; my block is here. That gap is the whole
of the remaining wait, read straight off the ChainInfo precompile at oh-F-D-three.

It advances in ten-block batches, so it moves in steps. End to end we measure six and a half to
nine minutes, over two hundred and thirty-nine samples — measured, not quoted from a spec.

Nothing in our app makes this faster, and Creditcoin is idle throughout. So we don't hide it.

*Cut here. Switch to Facility A.*

---

## 5 · The proof — 3:20 to 4:10

*Facility A, at PROOF_READY. Press Submit the proof.*

Here's one where attestation has finished. Everything the proof needs now exists, so I submit it.

*Let the stages run.*

One Creditcoin transaction. A Merkle proof per lock, plus one shared continuity proof — up to ten
locks in a single call. And the precompile at oh-F-D-two doesn't take our word for the position. It
re-derives the transaction index from the Merkle path itself.

*The badge flips.*

There — observed became **proven**. Verification and the state transition finished in one
Creditcoin block.

*Open the CC3 transaction on Blockscout.*

And we cross-check it: the precompile derives the index from the proof, the explorer reports it
independently, and every settlement records whether the two agree.

---

## 6 · What we don't claim — 4:10 to 4:30

*Back on the settlement page, calm.*

One thing we're careful about. This proves **ordering**, not authenticity. If a custodian issues two
receipts for one pallet, no amount of block ordering catches that. What we prevent is the same
registered claim being financed twice, or out of order.

Priority goes to the transaction that landed first — proven on Creditcoin, by the chain that saw it.

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
