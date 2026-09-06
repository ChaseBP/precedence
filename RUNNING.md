# Running PRECEDENCE on another machine

Written to be executed top to bottom by an agent with a shell, without asking questions.

Every command is copy-pasteable. Every claim in the "expected output" blocks was produced by
running the command, not written from memory. Where something is a trap, the trap is stated at the
point you would hit it rather than in a footnote.

**Read this first:** the app runs with **no secrets and no configuration at all**. Section 3 gets
you a working instance in about five minutes. Sections 4 onward add live chain reads, a wallet, and
settlement, and each one says exactly what it buys you. Do not start by collecting API keys.

---

## 1. What this is

A lending protocol where lien priority — who gets repaid first when collateral is sold — is decided
by where a lender's transaction landed in the block order, rather than by who filed paperwork
first. The pair `(block height, transaction index)` is proven on Creditcoin by an Attestcoin
precompile at `0x0FD2`. Two locks in the same block are separated by transaction index alone.

Four parts, in one repository:

| Directory | What it is | Runtime |
| --- | --- | --- |
| `precedence/` | Next.js app — the whole UI and its API routes | bun |
| `contracts/` | Seven Solidity contracts across two chains | Foundry |
| `worker/` | Proof submission, the auto-settle watcher, keeper pokes | bun |
| `ops/` | Deployment, measurement and submission-gate scripts | bun |

---

## 2. Prerequisites

```bash
# bun — runs the app, the worker and the ops scripts
curl -fsSL https://bun.sh/install | bash

# Foundry — only needed if you will compile or deploy contracts (sections 6+)
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

Verified working versions on the original machine:

```
bun    1.3.9
node   v24.12.0          # only needed for the Playwright verification scripts (section 8)
forge  1.6.0-v1.7.0
cast   1.6.0-v1.7.0
```

> **Trap — `forge` may not be Foundry.** On the original author's machine a different tool called
> `forge` sits earlier on `PATH`, and picking it up produces errors that read like Solidity
> problems. Everything in this repo calls `$(HOME)/.foundry/bin/forge` explicitly. If you invoke
> forge by hand, use the absolute path and confirm with `~/.foundry/bin/forge --version`.

> **Trap — the shell is zsh on the original machine.** zsh does not word-split unquoted variables,
> so `cmd $list` passes one argument, not several. And any file you generate containing `$` must be
> written with a **quoted** heredoc (`<<'EOF'`) or via Python — an unquoted heredoc silently ate
> every `$` in a generated file here, turning `$3,780,000` into `,780,000` with nothing visibly
> broken.

---

## 3. Run the app — no configuration required

```bash
git clone git@github.com:ChaseBP/precedence.git
cd precedence/precedence
bun install
bun run build
bun run start          # http://localhost:3000
```

Every screen works. Chain data is simulated and the interface says so — the header badge reads
`simulated`, and the landing page states which chains are live because it reads the adapters rather
than asserting anything.

**Verified with the environment file removed entirely.** All eight routes return 200:

```
/  /collateral  /race  /registry  /registry/new  /portfolio  /dashboard  /financiers
```

and `GET /api/config` reports:

```json
{ "mode": "mock",
  "sepolia":    { "requested": "mock", "live": false, "note": "mock requested" },
  "creditcoin": { "requested": "mock", "live": false, "note": "mock requested" },
  "runtime": "local" }
```

That is the honest degraded state, and it is the correct thing to demo if you have no keys.

### Useful variations

```bash
bun run dev                                   # hot reload on :3000
PORT=3117 bun run start                       # any port

# Persist state across restarts. Unset means memory-only, which is correct for serverless
# but means a page refresh after a restart loses every race you created.
PRECEDENCE_STORE_PATH=../evidence/.store.json bun run start
```

---

## 4. Configuration

All configuration lives in **one file at the repository root**: `.env.local`.

> **Trap — the file goes at the root, not in `precedence/`.** Next reads `.env.local` only from its
> own directory, so a root file would normally be invisible to it. `precedence/next.config.ts`
> loads `../.env.local` explicitly before Next boots. Putting a second copy inside `precedence/`
> will shadow it confusingly. One file, at the root.

Nothing here is committed. `.env.local` is gitignored and there is no example file to copy, so
create it:

```bash
cd /path/to/precedence          # repository root
touch .env.local && chmod 600 .env.local
```

### 4.1 Mode switches — the only ones that change behaviour without secrets

```bash
PRECEDENCE_MODE=mock            # master default for both chains: mock | chain
PRECEDENCE_SEPOLIA=chain        # per-chain override
PRECEDENCE_CREDITCOIN=chain     # per-chain override
PRECEDENCE_RUNTIME=local        # local | agent  (agent enables the document reader)
```

Requesting `chain` without the matching RPC **falls back to mock and records why**, visible at
`/api/config` as a `note`. The app degrades; it never lies about which mode it is in.

### 4.2 To read live chain state

```bash
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/<key>
CREDITCOIN_RPC=https://rpc.cc3-testnet.creditcoin.network
SEPOLIA_EXPLORER=https://sepolia.etherscan.io
CREDITCOIN_EXPLORER=https://creditcoin-testnet.blockscout.com
PROOF_BUILDER_URL=https://proof-gen-api.cc3-testnet.creditcoin.network
```

Contract addresses are **not** configuration. They are read from
`contracts/deployments/sepolia.json` and `contracts/deployments/creditcoin.json`, both of which are
committed — a fresh clone already points at the deployed contracts. A mistyped vault address would
break the proof-to-vault binding while looking like a verification failure, which is why it is not
an env var.

With both set to `chain`, `/api/config` reports:

```json
{ "mode": "chain",
  "sepolia":    { "requested": "chain", "live": true, "note": "live at 0x000d8d9C…6656" },
  "creditcoin": { "requested": "chain", "live": true, "note": "live at 0x1E6713Dd…9153" } }
```

### 4.3 Optional

```bash
GEMINI_API_KEY=<key>                          # PRECEDENCE_RUNTIME=agent document reader
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<id>     # without it, browser wallets only
PRECEDENCE_ADMIN_TOKEN=<any string>           # unlocks the reset control via ?admin=<token>
```

### 4.4 Keys — only for signing, never for reading

Needed only to run the worker (section 7) or deploy (section 6). The app never signs server-side;
every user transaction is signed by the visitor's own wallet.

```bash
PROVER_CC3_PK=0x…        # required by the worker
KEEPER_CC3_PK=0x…        # required by the worker
DEPLOYER_SEPOLIA_PK=0x…  # deployment only
DEPLOYER_CC3_PK=0x…      # deployment only
```

Generate a fresh set rather than reusing any — from inside `ops/`, because these scripts
import `ethers` and bun resolves it from `ops/node_modules`:

```bash
cd ops && bun install && bun run gen-keys.ts
```

Fund them with Sepolia ETH and CC3 testnet CTC from the respective faucets. **Never commit these and never paste them
into a chat.**

---

## 5. Using the app

**As a lender.** Facilities → open one → *Get test pUSD* (a permissionless faucet — without it a
fresh wallet holds nothing and the lock path is unreachable) → choose a tranche → lock. Four wallet
signatures. Your block and transaction index appear immediately; that pair **is** your priority.

**As a borrower.** Register collateral → the form opens with a fillable worked example → *Claim and
open* to register the asset on the Sepolia vault and open the race.

**Watching settlement.** Priority settlement shows the rank order the moment locks land, badged
`OBSERVED`, becoming `PROVEN` once attestation completes. The console subscribes over SSE, so the
flip happens without a refresh.

### 5.1 Getting a settlement that is not a scripted walkthrough

Two kinds of run exist and the interface labels which one you are looking at, in the breadcrumb at
the top of the settlement page: **`LIVE ON SEPOLIA`** or **`SCRIPTED WALKTHROUGH`**.

A scripted run is what the *Run a settlement* button produces. It walks all ten states in seconds
against simulated adapters, which is the only way to show the whole lifecycle, and its transaction
hashes are fabricated — so they are marked `sample` and deliberately do **not** link to an
explorer. Expect that. A dead explorer link would be far worse than a labelled one.

A live run needs two signatures and a deployed vault:

1. **Register collateral** with a wallet connected. Two Creditcoin CC3 transactions. Their hashes
   appear on the facility page afterwards under *Registered on Creditcoin CC3*.
2. On that facility, **Claim and open** as the same wallet. Two Sepolia transactions. The app then
   posts the opening transaction's hash to `POST /api/races/live`, which fetches the receipt,
   decodes `RaceOpened` from it and records the race with `simulated: false`.
3. **Lock capital** from any wallet — the same one is fine. Its hash goes to
   `POST /api/races/live/locks`, and the block and transaction index are read back off the receipt.

Follow the link the app offers, or open `/race` with no query string: it resolves to the running
settlement. What you should see is `LIVE ON SEPOLIA`, an *On-chain receipts* card listing every
transaction as a working explorer link, zero `sample` markers, and no *Step* / *Auto Run* controls —
those drive the scripted engine and are refused on a live race by `POST /api/races/[id]/advance`
with a 409, because running them would write a fabricated settlement over a real one.

Nothing is taken on the browser's word. Only a transaction hash is ever posted; every figure — the
block, the transaction index, the tranche, the amount, the vault's `seq` — is decoded server-side
from that receipt's `Lock_` or `RaceOpened` event, and a receipt that reverted, was emitted by a
different contract, or belongs to a different facility is rejected with a 422. The block and index
*are* the priority claim, so a party stating its own would be a party choosing its own rank.

### 5.2 What actually moves a live settlement forward

Nothing in this protocol advances on a timer, and the settlement page now names the stage it is in
and what is holding it, refreshed from both chains every 20 seconds.

| Stage | What it means | What moves it on |
|---|---|---|
| `WINDOW_OPEN` | Locks are being accepted. | The deadline passing. |
| `AWAITING_CLOSE` | The deadline passed. The vault rejects new locks but the race is **still open**. | Somebody sending `closeRace`. The obligor may at any time; **anyone** may once the deadline has passed. The page offers the button. |
| `AWAITING_ATTESTATION` | Closed. Attestcoin has not yet reached the source block. | Attestcoin, in ten-block batches. Watch the frontier close in. |
| `PROOF_READY` | The source block is attested. Every input the proof needs exists. | The worker. The page prints the exact command. |
| `PROVEN` | Verified at `0x0FD2`. Priority is settled — that part is finished. | The obligor drawing. |
| `ENCUMBERED` | Drawn, and the lien is running for the facility's term. | Repayment, days or months later. |
| `REPAID_AWAITING_PROOF` | Repaid on Sepolia. | Proving that repayment on Creditcoin — another attestation wait. |

**Settlement ending is not the lifecycle ending.** Stage 4 of the seven-stage strip covers
`PRIORITY_SETTLED` through `ENCUMBERED`, and stages 5 to 7 — refinance, payout, record — are the
loan's own life. A proven settlement sitting at stage 4 with four segments unlit is finished, not
stuck: refinance is opportunistic rather than a step, and repayment happens at the end of the term.
Draw and repay are on the facility page.

Two things surprise people, and both are deliberate:

- **The deadline does not close a race.** It only makes the vault start rejecting locks. Closing is
  a transaction. An auto-close would need a trusted timer; a permissionless close means settlement
  never waits on the borrower staying online.
- **Filling the facility does not close it either.** There is no quorum. A facility that filled
  short still settles — allocation simply stops at what arrived, and the rest is refundable.

So a race that has been "open" for longer than its window is not stuck and is not short of lenders.
It is waiting for `closeRace`, and after that for attestation.

> **Set `PRECEDENCE_STORE_PATH` before you start a live run.** Without it the store is
> memory-only, and restarting the server between the lock and the proof — eight minutes later —
> loses the app's record of a settlement whose transactions are still on chain and still cost gas.
> `PRECEDENCE_STORE_PATH=../evidence/.store.json bun run dev`

### 5.3 If the record is lost, recover it — do not redo the run

A live settlement lives on chain. The vault holds the race and every lock; the attestation of the
source block is a fact about Attestcoin. Only this app's *note* of it is local.

So a restart without `PRECEDENCE_STORE_PATH`, an admin reset or a fresh clone does not cost you a
run. On the facility page, **Recover the settlement from the chain** rebuilds the record — every
lock with its real transaction hash, block and transaction index, read back from Sepolia. Nothing
on chain changes and no attestation is repeated.

```bash
# the same thing without the UI
curl -X POST localhost:3000/api/races/live   -H 'content-type: application/json'   -d '{"collateralId":"col-…","recover":true}'
```

It needs no transaction hashes, because nothing is being claimed — every field comes from the
vault. The one thing it cannot recover is the `openRace` hash: storage does not keep it, so that
row is simply absent rather than guessed.

If Creditcoin has already settled the race, the prover refuses and says so — the proof on chain
stands whether or not this app knows about it.

> **Running two dev servers on one machine will not work.** A Next 16 Turbopack dev server on this
> project holds around 3.2GB. Two, plus a headless browser, exhausts an 8GB box. If you need a
> second instance for testing, use `bun run build && PORT=3100 bun run start` — measured at 157MB.

> **Expect a wait, and do not treat it as a hang.** Attestation of a source block takes **6.5–9.3
> minutes**, measured over 239 samples. This is Attestcoin's cadence — a standing ~32-block gap
> behind Sepolia head, advancing ten blocks at a time. It is not your RPC, and Creditcoin is idle
> throughout at roughly 1.3% utilisation. Nothing in this repository can shorten it. For a live
> demo, place the locks 10–12 minutes before you present; the settlement a viewer then watches is
> effectively instant.

---

## 6. Contracts (optional)

```bash
cd contracts
bun install                                   # @gluwa/usc-contracts, @openzeppelin/contracts
~/.foundry/bin/forge install foundry-rs/forge-std   # lib/ is gitignored, so this is required
make build
make test                                     # 88 unit + integration tests
make test-fork                                # 4 tests against a live CC3 fork
make verify-precompile                        # 10 live checks -> evidence/precompile.json
```

> **`via_ir = true` is required, not an optimisation.** The precompile's batch signature exhausts
> the EVM stack in the legacy pipeline. Turning it off to speed up compiles means the contracts do
> not build at all.

> **A Foundry fork cannot test the precompile.** `0x0FD2` is a Substrate *runtime* precompile with
> no EVM bytecode, so a fork fetches empty code and runs your call against a plain account —
> assertions about it pass or fail for unrelated reasons. Live evidence comes from
> `make verify-precompile` over direct RPC.

### Redeploying

```bash
make deploy-sepolia        # forge script is fine here
make deploy-creditcoin     # uses cast send — see the trap below
```

> **`forge script --broadcast` cannot be used on CC3.** The transactions land, but Foundry then
> polls for receipts by deserialising full blocks and CC3 omits `mixHash`, so every poll fails with
> `missing field mixHash`, the script retries forever, and it never reaches the wiring calls. On
> 2026-09-02 this left five contracts deployed with **zero** of their five wiring transactions
> sent, while the deployment file looked complete — and the addresses it printed came from the
> simulation, not the broadcast. Deploy and wire CC3 with `cast send`, then verify every permission
> with a `cast call` read. Never trust the deployment file.

After any contract change, regenerate the ABIs: `cd ops && bun run sync-abis.ts`.

---

## 7. The worker — required for settlement to complete on its own

The web app deliberately cannot submit proofs. An ~8-minute attestation wait is not a serverless
shape, and a keeper key inside the web app would blur the very property the failure branch exists
to demonstrate.

```bash
cd worker
bun install
bun run src/cli.ts watch <collateralId>    # polls the vault every 20s and auto-settles
bun run src/cli.ts status                  # one-shot report
bun run src/cli.ts prove <collateralId> <txHash…>
bun run src/cli.ts keeper <collateralId…>  # timestamp-gated pokes for the distress track
```

Requires `PROVER_CC3_PK`, `KEEPER_CC3_PK` and `SEPOLIA_RPC`.

**Without the watcher running, a real lock stays at `OBSERVED` indefinitely** — correctly, because
nothing has proven it. A fully live demo is two processes: the app, and the watcher.

---

## 8. Verifying a machine is set up correctly

```bash
cd precedence
bun run scripts/smoke.ts     # must print: ALL CHECKS PASSED
bunx tsc --noEmit            # must be silent
bun run build                # must succeed
```

`smoke.ts` asserts the invariants the product's claims rest on: strict seniority, first loss landing
on the most subordinate tranche, `seq` contiguity, strictly increasing `(height, txIndex)`, and that
the same-block tie-break is actually exercised. If you change settlement or the waterfall, that file
is what catches you.

### Browser checks

Playwright is not a dependency of this repository. The crawl and audit scripts resolve it from
wherever it is installed:

```bash
bun add -d playwright && bunx playwright install chromium
```

> **Trap — Node resolves `playwright` from the script's own directory, not your working directory.**
> A script placed elsewhere fails with `ERR_MODULE_NOT_FOUND` no matter where you run it from. Copy
> `ops/ui-crawl.mjs` next to the installed `node_modules` and run it there.

```bash
RACE_ID=<a settled race id> node ui-crawl.mjs
```

Expected: **0 findings** across 9 routes × 13 widths — no horizontal overflow, no console errors,
no blank pages.

> **Trap — the crawler must wait for content, not for the network.** `networkidle` plus a fixed
> delay measures client-fetching pages mid-render and reports them blank. It happened seven times in
> one run, at some widths and not others, which reads exactly like a width-dependent layout bug and
> is not one. The committed version waits for the text length to stop changing; do not replace that
> with a sleep.

---

## 9. Things that will waste your time if you do not know them

**Check for fresh data, not for a process.** Never `pkill -f <pattern>` or `pgrep -f <pattern>`
where the pattern appears in your own command line — both self-match. `pgrep -f measure-latency`
once reported a sampler as running when it had been dead for thirteen hours; it was matching the
grep itself.

**A long-running agent task can hang while looking alive.** Compare CPU time against elapsed time:
31 seconds of CPU across 39 minutes of wall clock means blocked, not busy.

**Two chains, two addresses, and they used to collide.** The first deployment put a CC3 contract and
a Sepolia contract at the same address because one deployer key hit the same nonces on both. It was
harmless and deeply confusing. Always state the chain when quoting an address.

**The `Lock_` event signature is load-bearing on both chains.** `AttestationGate.LOCK_EVENT_SIG`
must equal `PriorityVault.lockEventSignature()`, or every proof fails to find its log and it looks
like a verification problem rather than a schema mismatch. Adding a field to that event means
redeploying both sides together.

**Alchemy's free tier caps `eth_getLogs` at 10 blocks.** The worker reads lock positions from vault
state rather than by scanning logs, specifically because of this.

---

## 10. Quick reference

```bash
# minimum viable: app only, simulated, no secrets
cd precedence && bun install && bun run build && bun run start

# live reads: add to ../.env.local, then restart
#   PRECEDENCE_SEPOLIA=chain
#   PRECEDENCE_CREDITCOIN=chain
#   SEPOLIA_RPC=…  CREDITCOIN_RPC=…

# settlement completes on its own: second process
cd worker && bun run src/cli.ts watch <collateralId>

# is this machine healthy?
cd precedence && bun run scripts/smoke.ts && bunx tsc --noEmit && bun run build
```

Ground truth for what is deployed lives in `contracts/deployments/*.json`, and the verified
Attestcoin API reference — which corrects several wrong signatures found in the original plan — is
`ATTESTCOIN_FACTS.md`. Read that before writing chain code.
