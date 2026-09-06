#!/usr/bin/env bash
# Deploy the frontend to Vercel, pointed at an already-working Azure backend.
#
# Usage:  ops/deploy-vercel.sh https://your-host.centralindia.cloudapp.azure.com
#
# Refuses to deploy unless the backend is reachable AND reports chain mode, because a Vercel
# deployment built against a mock-mode backend looks identical to a working one until someone
# clicks a transaction hash.
set -euo pipefail

ORIGIN="${1:-}"
if [[ -z "$ORIGIN" ]]; then
  echo "usage: $0 https://<azure-host>" >&2; exit 2
fi
ORIGIN="${ORIGIN%/}"
[[ "$ORIGIN" == https://* ]] || { echo "the origin must be https — Vercel will not proxy to http" >&2; exit 2; }

# The Vercel CLI shells out to `node`, which lives under nvm here and is not on the default PATH.
NODE_BIN="$(dirname "$(ls -1 "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)")"
[[ -n "$NODE_BIN" ]] && export PATH="$NODE_BIN:$PATH"
command -v node >/dev/null || { echo "no node on PATH; the vercel CLI needs one" >&2; exit 1; }

echo "==> checking the backend at $ORIGIN"
CFG="$(curl -fsS --max-time 20 "$ORIGIN/api/config")" || { echo "backend unreachable" >&2; exit 1; }
python3 - "$CFG" <<'PY'
import json, sys
c = json.loads(sys.argv[1])
if c.get("misconfigured"):
    sys.exit(f"backend reports {c['misconfigured']} — it is proxying to itself; fix that first")
mode = c.get("mode")
sep = (c.get("sepolia") or {})
cc  = (c.get("creditcoin") or {})
print(f"    mode={mode}  sepolia.live={sep.get('live')}  creditcoin.live={cc.get('live')}")
if not (sep.get("live") and cc.get("live")):
    print(f"    sepolia note   : {sep.get('note')}")
    print(f"    creditcoin note: {cc.get('note')}")
    sys.exit("backend is NOT in chain mode — deploying against it would ship a mock-mode app")
if not (c.get("addresses") or {}).get("sepolia", {}).get("PriorityVault"):
    sys.exit("backend reports no deployed vault address")
print("    backend is live on both chains")
PY

cd "$(dirname "$0")/../precedence"

# Linked from `precedence/`, not the repo root. This is a monorepo, but it holds exactly ONE Vercel
# project, and running from the project's own directory makes the target unambiguous — so a plain
# `link` is right here and `--repo` (which exists for repos with several projects) is not needed.
# `-y` takes the default team and settings; `--project` makes it non-interactive.
if [[ ! -f .vercel/project.json ]]; then
  echo "==> linking the Vercel project"
  vercel link -y --project precedence
fi

echo "==> setting PRECEDENCE_API_ORIGIN (build-time: next.config.ts reads it)"
for env in production preview; do
  vercel env rm PRECEDENCE_API_ORIGIN "$env" --yes >/dev/null 2>&1 || true
  printf '%s' "$ORIGIN" | vercel env add PRECEDENCE_API_ORIGIN "$env" >/dev/null
done

echo "==> deploying"
URL="$(vercel deploy --prod --yes | tail -1)"
echo "    $URL"

echo "==> verifying the deployed frontend proxies to the backend"
for i in $(seq 1 10); do
  OUT="$(curl -fsS --max-time 20 "$URL/api/config" 2>/dev/null)" && break
  sleep 5
done
python3 - "${OUT:-}" <<'PY'
import json, sys
raw = sys.argv[1]
if not raw:
    sys.exit("the deployed /api/config did not respond")
c = json.loads(raw)
if c.get("misconfigured"):
    sys.exit("the rewrite did not apply — PRECEDENCE_API_ORIGIN must be set at BUILD time; redeploy")
if c.get("mode") != "chain":
    sys.exit(f"the frontend answered locally in {c.get('mode')} mode — the rewrite is misplaced")
print("    frontend is proxying correctly and reports chain mode")
PY
echo "done: $URL"
