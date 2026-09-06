# Deploying PRECEDENCE — Vercel frontend, Azure backend

Written to be followed top to bottom without asking questions. The single thing that can go wrong
silently is the app landing in **mock mode**, so that is what most of this document is about.

## 1. Why it is split at all

The frontend and the API are one Next.js app in this repo, and they cannot both run on Vercel.
Three things in the API need a real machine:

| Needs | Why serverless cannot do it |
|---|---|
| `PRECEDENCE_STORE_PATH` — a JSON file on disk | No persistent filesystem, and each invocation may be a different instance. A race recorded by one request would not exist for the next. |
| The prover — spawns `bun run src/cli.ts` in `../worker` | No `bun`, no worker checkout, no long-running child processes. |
| `getDeps()` — reads `../contracts/deployments/*.json` | Those files are outside the Next root and gitignored, so they are not in the bundle. |

Miss any of them and `getDeps()` falls back to the mock adapters. The app then reports both chains
as simulated — which is the honest answer to a broken configuration, and useless to show anyone.

**So: Azure runs the whole Next app plus the worker. Vercel runs the same app and proxies every
`/api/*` call to Azure.** Vercel therefore never executes an API route, and never needs the store,
the deployment files or the worker.

This works because of a property worth checking before trusting it: **every page in this app is a
client component.** Only `app/layout.tsx`, `app/(app)/layout.tsx` and `app/not-found.tsx` render on
the server, and none of them touch config, the store or fetch anything.

```bash
# confirm it, rather than believing this file
cd precedence
for f in $(find app -name 'page.tsx'); do head -3 "$f" | grep -q '"use client"' || echo "SERVER: $f"; done
# expected: no output
```

If that ever prints a page, that page will render against mock adapters on Vercel and this split
needs revisiting.

## 2. Azure — the backend

A small burstable VM. It must **build** the Next app (~2 GB free during `next build`) and then run
it (~160 MB) alongside the worker.

- `Standard_B2s` (2 vCPU / 4 GB) is comfortable.
- `Standard_B1ms` (1 vCPU / 2 GB) works **only with a 4 GB swapfile added**.
- Ubuntu 22.04/24.04 LTS, 30 GB standard SSD, ports 22/80/443 only. Never expose 3000.
- Give the VM a **DNS name label** so it gets a stable `*.<region>.cloudapp.azure.com` hostname —
  Vercel rewrites to a URL, so the backend needs a name and a certificate, not an IP.

The tree on the box must mirror the local layout, because the paths are relative and load-bearing:

```
~/ctc/.env.local                          # copied, never committed
~/ctc/contracts/deployments/sepolia.json  # copied — gitignored, and without it: mock mode
~/ctc/contracts/deployments/creditcoin.json
~/ctc/precedence/                         # bun install && bun run build
~/ctc/worker/                             # bun install — the prover spawns this
~/ctc/evidence/                           # writable: the store and proof evidence land here
```

Run the app under systemd with `PORT=3000` and
`PRECEDENCE_STORE_PATH=/home/<user>/ctc/evidence/.store.json`. Everything else comes from
`.env.local`, which `next.config.ts` loads itself — do not duplicate secrets into the unit file.
Put Caddy in front for TLS, reverse-proxying `127.0.0.1:3000`.

### The check that matters

```bash
curl -s https://<host>/api/config | python3 -m json.tool
```

`"mode"` must be `"chain"`, with `sepolia.live: true` and `creditcoin.live: true`. If either is
false, the `note` beside it names the cause — a missing `SEPOLIA_RPC` or a missing
`contracts/deployments/*.json`. **Do not proceed to Vercel until this passes.**

## 3. Vercel — the frontend

- **Root Directory: `precedence`.** The repo root is the monorepo.
- **`PRECEDENCE_API_ORIGIN` = `https://<host>`** — the Azure hostname, no trailing slash.

That variable is read in `next.config.ts`, so it is needed **at build time**. Setting it in the
Vercel dashboard without redeploying does nothing, which is the most likely way to get this wrong.

### Why the rewrite is `beforeFiles`

From the Next docs: a `rewrites()` returning a plain **array** is *"applied after checking the
filesystem (pages and `/public` files)"*. This app has real `app/api/*` route handlers, so an
array-form rewrite for `/api/:path*` **loses to them every time** — the proxy never fires, Vercel
answers from its own mock adapters, and the only symptom is an app quietly reporting both chains as
simulated. `beforeFiles` is checked *"before all files"*, and is the only placement that overrides a
route handler.

Verify the placement in the build output rather than assuming it:

```bash
python3 -c "
import json; rw = json.load(open('.next/routes-manifest.json'))['rewrites']
print(rw if isinstance(rw, list) else rw['beforeFiles'])"
# expected: [{'source': '/api/:path*', 'destination': 'https://<host>/api/:path*', ...}]
# a flat list, or an empty beforeFiles, means the proxy is not in effect
```

### The canary

If `PRECEDENCE_API_ORIGIN` is set and `/api/config` still executes on Vercel, the rewrite did not
fire. That route detects its own situation and returns **503** with
`misconfigured: "api-rewrite-not-applied"` rather than mock data, and the UI says *"This deployment
cannot reach its API, so nothing here can be verified"* instead of *"simulated"*.

Those two are different states and the distinction is the point: simulated is a deliberate
configuration and safe to display; this is a routing failure whose answers are meaningless.

## 4. After deploying

```bash
curl -s https://<vercel-host>/api/config | python3 -m json.tool   # must match the Azure answer
```

Same `mode: chain`, same addresses. If it returns 503 with `misconfigured`, redeploy with the env
var set at build time. If it returns `mode: mock`, the rewrite is in the wrong placement.

Then walk the live path in the browser — register collateral, open a race, lock, close, prove — and
confirm the on-chain receipts open on Etherscan and Blockscout.

## 5. Things that will waste your time

- **Vercel's install/build command.** This project uses `bun`. If Vercel's autodetection picks
  something else, set the install command to `bun install` and the build to `bun run build`.
- **`loadRootEnv()` finds nothing on Vercel.** It reads `../.env.local`, which is not in the
  deployment. That is fine and expected — it returns early. It is *not* the cause of a mock-mode
  reading; a missing deployments file is.
- **The worker must be on the Azure box even though nothing imports it.** The prover route spawns
  `bun run src/cli.ts` in `../worker`. Without it, `proverAvailable()` reports the reason and the
  "Submit the proof" button is correctly disabled — but you lose the ability to settle.
- **`evidence/` must be writable by the service user.** The prover writes its proof evidence there,
  and `applyProvenSettlement` reads it back to record the settlement.
- **Do not run two dev servers.** A Turbopack dev server on this project holds ~3.2 GB. For a second
  instance use `bun run build && PORT=3100 bun run start` — about 160 MB.
- **`vercel` cannot find `node` on this machine.** It is installed under nvm and is not on the
  default `PATH`, so the CLI dies with `/usr/bin/env: 'node': No such file or directory`. Prefix it:

  ```bash
  PATH="$HOME/.nvm/versions/node/v24.12.0/bin:$PATH" vercel …
  ```

  `bun` is on the path normally; only the Vercel CLI needs this.
