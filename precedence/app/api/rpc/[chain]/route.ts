import { CREDITCOIN_RPC_DEFAULT, getConfig } from "@/lib/precedence/config";

/**
 * POST /api/rpc/sepolia | /api/rpc/creditcoin — a read-only JSON-RPC proxy for the browser.
 *
 * @remarks Exists because the browser had no usable RPC of its own. `wagmi.ts` configured
 * `http()` with no URL, so viem fell back to the chain's public default — for Sepolia that is
 * `11155111.rpc.thirdweb.com`, an unauthenticated endpoint shared by everyone on the internet.
 *
 * It failed in production exactly as you would expect: the app polls the vault every six seconds
 * per open facility, the endpoint throttled the visitor's IP, and a throttled response there comes
 * back WITHOUT CORS headers. So the browser reported `net::ERR_FAILED` and "no
 * Access-Control-Allow-Origin", which reads like a configuration mistake in our app and is really
 * a rate limit two hops away. Nothing about it was fixable from the client.
 *
 * The server already holds a real Alchemy key in `SEPOLIA_RPC`. It cannot be handed to the browser
 * — a `NEXT_PUBLIC_` RPC URL is a credential in the bundle for anyone to lift — so the request
 * comes here instead and the key stays server-side.
 *
 * **Read-only by allowlist.** An open JSON-RPC proxy is an open relay: someone would find it and
 * spend the key. Only the methods this app actually needs are forwarded, and no method that
 * submits a transaction is among them — writes go through the user's own wallet provider, never
 * through here.
 */

/** Methods the browser genuinely needs. Everything else is refused. */
const ALLOWED = new Set([
  // contract reads — the bulk of it
  "eth_call",
  // receipts and confirmation waits
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  // chain and block state
  "eth_chainId",
  "net_version",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  // balances and nonces
  "eth_getBalance",
  "eth_getTransactionCount",
  // fee estimation, which wagmi does before prompting a wallet
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
]);

/**
 * A crude per-IP budget.
 *
 * @remarks Not security — it is a spend cap. The allowlist is what stops abuse; this stops one
 * enthusiastic tab from consuming the month's compute units. In memory on purpose: a restart
 * resetting it is fine, and a shared store would be more machinery than the problem deserves.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 600;
const g = globalThis as unknown as { __precedenceRpcHits?: Map<string, number[]> };

const hits: Map<string, number[]> = (g.__precedenceRpcHits ??= new Map());

function overBudget(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) {
    // Bound the map. Anything with no activity in the window cannot be over budget anyway.
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}

function upstreamFor(chain: string): string | null {
  const c = getConfig();
  if (chain === "sepolia") return c.sepoliaRpc || null;
  if (chain === "creditcoin") return c.creditcoinRpc || CREDITCOIN_RPC_DEFAULT;
  return null;
}

export async function POST(req: Request, { params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  const upstream = upstreamFor(chain);
  if (!upstream) {
    return Response.json(
      { error: { code: -32601, message: `no RPC configured for "${chain}"` } },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: { code: -32700, message: "invalid JSON" } }, { status: 400 });
  }

  // viem batches, so a body may be a single call or an array of them. Every member is checked:
  // one disallowed method in a batch rejects the batch rather than being quietly dropped.
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length > 25) {
    return Response.json({ error: { code: -32600, message: "batch too large" } }, { status: 400 });
  }
  for (const c of calls) {
    const m = (c as { method?: unknown })?.method;
    if (typeof m !== "string" || !ALLOWED.has(m)) {
      return Response.json(
        {
          error: {
            code: -32601,
            message:
              `method "${String(m)}" is not proxied. This endpoint forwards read-only calls only; ` +
              `transactions go through your own wallet.`,
          },
        },
        { status: 403 },
      );
    }
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (overBudget(ip)) {
    return Response.json(
      { error: { code: -32005, message: "too many requests" } },
      { status: 429, headers: { "retry-after": "30" } },
    );
  }

  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    // The upstream URL is never echoed: it carries the API key.
    return Response.json(
      { error: { code: -32603, message: `upstream RPC unreachable: ${(e as Error).name}` } },
      { status: 502 },
    );
  }
}
