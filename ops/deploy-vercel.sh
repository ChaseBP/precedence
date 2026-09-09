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

# Two separate PATH problems, and missing either one stops this script dead.
#   - `vercel` was installed with bun, so the binary is in ~/.bun/bin.
#   - the CLI then shells out to `node`, which lives under nvm and is on neither default PATH.
NODE_BIN="$(dirname "$(ls -1 "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)")"
[[ -n "$NODE_BIN" ]] && export PATH="$NODE_BIN:$PATH"
export PATH="$HOME/.bun/bin:$PATH"
command -v node   >/dev/null || { echo "no node on PATH; the vercel CLI needs one" >&2; exit 1; }
command -v vercel >/dev/null || { echo "no vercel on PATH (looked in ~/.bun/bin)" >&2; exit 1; }

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

# `--no-sensitive` is not optional here, and getting it wrong fails the build in a way that names
# nothing useful. `vercel env add` stores a value as a SECRET by default, and a secret is redacted
# at build time — so `next.config.ts`, which must READ this to construct the rewrite, receives the
# literal placeholder and next build dies with:
#
#     `destination` does not start with `/`, `http://`, or `https://` for route
#     {"source":"/api/:path*","destination":"[SENSITIVE]/api/:path*"}
#
# The origin is a public hostname, not a credential, so storing it as readable config is also the
# honest classification.
echo "==> setting PRECEDENCE_API_ORIGIN (build-time: next.config.ts reads it)"
for env in production preview; do
  vercel env rm PRECEDENCE_API_ORIGIN "$env" --yes >/dev/null 2>&1 || true
  vercel env add PRECEDENCE_API_ORIGIN "$env" --no-sensitive --value "$ORIGIN" >/dev/null
done

# Built here, then uploaded as output. A remote build on this account has repeatedly stalled at
# status UNKNOWN with no logs at all — including a --prebuilt deploy, which has nothing to build —
# so keeping the build local means a failure is visible in this terminal instead of invisible on
# theirs. It is also the pattern the Vercel CLI docs recommend for any pipeline that wants a gate
# between build and deploy.
echo "==> building locally with production env"
vercel pull --yes --environment=production >/dev/null
vercel build --prod

echo "==> deploying the built output"
vercel deploy --prebuilt --prod --yes

# Verify against the project's stable ALIAS, not the deployment URL `vercel deploy` prints last.
#
# That per-deployment URL (`precedence-<hash>-<scope>.vercel.app`) sits behind Vercel's Deployment
# Protection on a fresh project and answers every request with a 302 to a login page — so checking
# it reports a broken deployment that is in fact fine. The production alias is public. Asked of the
# API rather than assumed, because a project can have several aliases.
# `vercel alias ls` maps the deployment URL to its aliases. The deployment URL itself is the one
# thing NOT to use — see above. Prefer the shortest alias, which is the friendly project domain
# rather than the `<project>-<scope>` form.
ALIAS="$(vercel alias ls 2>/dev/null \
  | grep -oE '[a-z0-9-]+\.vercel\.app' \
  | grep -v -- '-chasebp' \
  | awk '{ print length, $0 }' | sort -n | head -1 | cut -d' ' -f2-)"
URL="${ALIAS:+https://$ALIAS}"
[[ -n "$URL" ]] || { echo "deployed, but could not determine the public alias to verify" >&2; exit 1; }
echo "    $URL"

echo "==> verifying the deployed frontend proxies to the backend"
for i in $(seq 1 12); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL/api/config" || true)"
  if [[ "$CODE" == "30"* ]]; then
    echo "    $URL redirects (HTTP $CODE) — Deployment Protection is on for this URL." >&2
    echo "    Disable it for production, or verify with: vercel curl $URL/api/config" >&2
    exit 1
  fi
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
