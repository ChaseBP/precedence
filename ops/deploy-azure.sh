#!/usr/bin/env bash
# Push the app and worker to the Azure backend, rebuild, restart, verify.
#
#   ops/deploy-azure.sh
#
# Syncs SOURCE ONLY. It never touches the three things on that box that are not in git and cannot
# be regenerated: `.env.local`, `contracts/deployments/*.json`, and `evidence/` — which holds the
# live store and every proof artifact. Deleting any of them silently drops the app into mock mode
# or loses a settlement, so they are excluded on the way in and never deleted.
set -euo pipefail

HOST="${PRECEDENCE_AZURE_HOST:-precedence-ctc-76d4b6.centralindia.cloudapp.azure.com}"
KEY="${PRECEDENCE_AZURE_KEY:-$HOME/.ssh/precedence_azure}"
USER_AT="azureuser@$HOST"
SSH=(ssh -i "$KEY" -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new "$USER_AT")
REPO="$(cd "$(dirname "$0")/.." && pwd)"

[[ -f "$KEY" ]] || { echo "no ssh key at $KEY" >&2; exit 1; }

echo "==> syncing source to $HOST"
for dir in precedence worker; do
  rsync -az --delete \
    -e "ssh -i $KEY -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new" \
    --exclude 'node_modules' --exclude '.next' --exclude '.git' --exclude '.vercel' \
    --exclude '.env*' --exclude 'out' --exclude 'out-fork' --exclude 'cache' \
    "$REPO/$dir/" "$USER_AT:ctc/$dir/"
  echo "    $dir"
done

echo "==> installing and building (this is the slow part)"
"${SSH[@]}" 'set -e
  export PATH="$HOME/.bun/bin:$PATH"
  cd ~/ctc/worker     && bun install --silent
  cd ~/ctc/precedence && bun install --silent && bun run build'

echo "==> restarting the service"
"${SSH[@]}" 'sudo systemctl restart precedence && sleep 4 && systemctl is-active precedence'

echo "==> verifying"
for i in $(seq 1 15); do
  CFG="$(curl -fsS --max-time 20 "https://$HOST/api/config" 2>/dev/null)" && break
  sleep 4
done
python3 - "${CFG:-}" <<'PY'
import json, sys
raw = sys.argv[1]
if not raw: sys.exit("the backend did not answer /api/config after restart")
c = json.loads(raw)
sep, cc = c.get("sepolia") or {}, c.get("creditcoin") or {}
print(f"    mode={c.get('mode')}  sepolia.live={sep.get('live')}  creditcoin.live={cc.get('live')}")
print(f"    store={c.get('store')}")
if not (sep.get("live") and cc.get("live")):
    print(f"    sepolia note   : {sep.get('note')}")
    print(f"    creditcoin note: {cc.get('note')}")
    sys.exit("BACKEND IS IN MOCK MODE — a deployments file or SEPOLIA_RPC went missing")
PY

# The RPC proxy is the whole point of this deploy, so it is checked explicitly rather than assumed.
BN="$(curl -fsS --max-time 25 -X POST "https://$HOST/api/rpc/sepolia" \
        -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber"}' | python3 -c 'import json,sys;print(json.load(sys.stdin).get("result",""))')"
[[ "$BN" == 0x* ]] || { echo "    /api/rpc/sepolia did not return a block number (got: $BN)" >&2; exit 1; }
echo "    /api/rpc/sepolia -> block $((BN)) "

REJ="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST "https://$HOST/api/rpc/sepolia" \
        -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"eth_sendRawTransaction","params":["0x00"]}')"
[[ "$REJ" == "403" ]] || { echo "    the write-method allowlist is NOT in effect (got $REJ)" >&2; exit 1; }
echo "    write methods refused (403)"

echo "done: https://$HOST"
