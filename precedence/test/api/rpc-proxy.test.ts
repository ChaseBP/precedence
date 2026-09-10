/**
 * `POST /api/rpc/:chain` — the read-only JSON-RPC proxy the browser uses.
 *
 * @remarks It exists because the browser had no usable RPC of its own. `wagmi.ts` configured
 * `http()` with no URL, so viem fell back to the chain's public default — for Sepolia that is an
 * unauthenticated endpoint shared by everyone on the internet. It failed in production exactly as
 * you would expect: the app polls the vault every six seconds per open facility, the endpoint
 * throttled the visitor's IP, and a throttled response from that host comes back *without* CORS
 * headers. So the browser reported `net::ERR_FAILED` and a missing `Access-Control-Allow-Origin`,
 * which reads like a mistake in our app and is really a rate limit two hops away.
 *
 * The server's key cannot be handed to the browser — a `NEXT_PUBLIC_` RPC URL is a credential in
 * the bundle for anyone to lift — so the request comes here and the key stays server-side. Which
 * makes this an open relay unless it is locked down, and the two locks are what these tests are
 * about: an allowlist that admits no method capable of submitting a transaction, and a per-IP
 * budget so one enthusiastic tab cannot spend the month's compute units.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { deps, resetFakes, upstream } from "../helpers/fakes";
import { freshStore } from "../helpers/fixtures";
import { ctx, json, post, postRaw } from "../helpers/http";

const route = () => import("@/app/api/rpc/[chain]/route");

const UPSTREAM = "https://rpc.test-upstream.invalid/SECRET_KEY";

/** A distinct client address per test, because the budget is keyed on it and lives in memory. */
let ipCounter = 0;
const nextIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

interface Body {
  error?: { code: number; message: string };
  result?: unknown;
}

async function rpc(
  chain: string,
  body: unknown,
  headers: Record<string, string> = { "x-forwarded-for": nextIp() },
) {
  const { POST } = await route();
  return json<Body>(
    await POST(post(`/api/rpc/${chain}`, body, headers), ctx({ chain })),
  );
}

function call(method: string, params: unknown[] = []) {
  return { jsonrpc: "2.0", id: 1, method, params };
}

/** Every method the browser genuinely needs. */
const ALLOWED = [
  "eth_call",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_chainId",
  "net_version",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
];

/** Methods that must never be proxied. Writes go through the user's own wallet. */
const REFUSED = [
  "eth_sendTransaction",
  "eth_sendRawTransaction",
  "eth_sign",
  "eth_signTransaction",
  "eth_signTypedData_v4",
  "personal_sign",
  "personal_unlockAccount",
  "eth_accounts",
  "eth_requestAccounts",
  "debug_traceTransaction",
  "trace_replayTransaction",
  "admin_addPeer",
  "miner_start",
  "txpool_content",
  "eth_newFilter",
  // Not a write, but capped at ten blocks on the free tier and never used by the browser.
  "eth_getLogs",
];

describe("POST /api/rpc/:chain", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
    deps.config = { sepoliaRpc: UPSTREAM };
  });

  describe("chain selection", () => {
    test("404s an unknown chain", async () => {
      const { status, body } = await rpc("polygon", call("eth_chainId"));
      expect(status).toBe(404);
      expect(body.error?.code).toBe(-32601);
      expect(body.error?.message).toContain('no RPC configured for "polygon"');
    });

    test("404s Sepolia when no RPC is configured", async () => {
      deps.config = { sepoliaRpc: "" };
      const { status } = await rpc("sepolia", call("eth_chainId"));
      expect(status).toBe(404);
    });

    test("forwards Sepolia to the configured upstream", async () => {
      await rpc("sepolia", call("eth_chainId"));
      expect(upstream.calls[0].url).toBe(UPSTREAM);
    });

    test("falls back to the default RPC for Creditcoin", async () => {
      deps.config = { creditcoinRpc: "" };
      await rpc("creditcoin", call("eth_chainId"));
      expect(upstream.calls[0].url).toBe("https://rpc.cc3-testnet.creditcoin.network");
    });

    test("prefers a configured Creditcoin RPC over the default", async () => {
      deps.config = { creditcoinRpc: "https://rpc.custom-cc3.invalid" };
      await rpc("creditcoin", call("eth_chainId"));
      expect(upstream.calls[0].url).toBe("https://rpc.custom-cc3.invalid");
    });

    test("404s an empty chain segment", async () => {
      const { status } = await rpc("", call("eth_chainId"));
      expect(status).toBe(404);
    });

    test("is case sensitive about the chain name", async () => {
      const { status } = await rpc("Sepolia", call("eth_chainId"));
      expect(status).toBe(404);
    });
  });

  describe("the request body", () => {
    test("400s a body that is not JSON", async () => {
      const { POST } = await route();
      const res = await POST(
        postRaw("/api/rpc/sepolia", "<not json>", { "x-forwarded-for": nextIp() }),
        ctx({ chain: "sepolia" }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe(-32700);
    });

    test("400s a batch larger than twenty-five", async () => {
      const { status, body } = await rpc(
        "sepolia",
        Array.from({ length: 26 }, () => call("eth_chainId")),
      );
      expect(status).toBe(400);
      expect(body.error?.code).toBe(-32600);
      expect(body.error?.message).toBe("batch too large");
    });

    test("accepts a batch of exactly twenty-five", async () => {
      const { status } = await rpc(
        "sepolia",
        Array.from({ length: 25 }, () => call("eth_chainId")),
      );
      expect(status).toBe(200);
    });

    test("accepts a single call as well as a batch, because viem sends both", async () => {
      const single = await rpc("sepolia", call("eth_chainId"));
      const batch = await rpc("sepolia", [call("eth_chainId")]);
      expect(single.status).toBe(200);
      expect(batch.status).toBe(200);
    });

    test("403s an empty object with no method", async () => {
      const { status, body } = await rpc("sepolia", {});
      expect(status).toBe(403);
      expect(body.error?.message).toContain("is not proxied");
    });

    test("403s a method that is not a string", async () => {
      const { status } = await rpc("sepolia", { jsonrpc: "2.0", id: 1, method: 42 });
      expect(status).toBe(403);
    });

    test("403s null", async () => {
      const { status } = await rpc("sepolia", null);
      expect(status).toBe(403);
    });

    test("forwards an empty batch without asking the upstream anything useful", async () => {
      const { status } = await rpc("sepolia", []);
      expect(status).toBe(200);
    });
  });

  describe("the allowlist", () => {
    for (const method of ALLOWED) {
      test(`forwards ${method}`, async () => {
        const { status } = await rpc("sepolia", call(method));
        expect(status).toBe(200);
        expect(upstream.calls).toHaveLength(1);
      });
    }

    for (const method of REFUSED) {
      test(`refuses ${method}`, async () => {
        const { status } = await rpc("sepolia", call(method));
        expect(status).toBe(403);
      });
    }

    test("contacts no upstream at all when it refuses", async () => {
      await rpc("sepolia", call("eth_sendRawTransaction"));
      expect(upstream.calls).toEqual([]);
    });

    test("says where transactions go instead", async () => {
      const { body } = await rpc("sepolia", call("eth_sendTransaction"));
      expect(body.error?.message).toContain("read-only");
      expect(body.error?.message).toContain("your own wallet");
    });

    test("names the method it refused", async () => {
      const { body } = await rpc("sepolia", call("eth_sendTransaction"));
      expect(body.error?.message).toContain("eth_sendTransaction");
    });

    test("one disallowed member rejects the whole batch", async () => {
      // Quietly dropping it would leave the caller with a short response and no explanation.
      const { status } = await rpc("sepolia", [
        call("eth_chainId"),
        call("eth_sendRawTransaction"),
        call("eth_blockNumber"),
      ]);
      expect(status).toBe(403);
    });

    test("forwards nothing from a batch it rejected", async () => {
      await rpc("sepolia", [call("eth_chainId"), call("eth_sendRawTransaction")]);
      expect(upstream.calls).toEqual([]);
    });

    test("checks the last member too", async () => {
      const { status } = await rpc("sepolia", [
        call("eth_chainId"),
        call("eth_blockNumber"),
        call("personal_sign"),
      ]);
      expect(status).toBe(403);
    });

    test("applies the same allowlist to Creditcoin", async () => {
      deps.config = { creditcoinRpc: "https://rpc.custom-cc3.invalid" };
      const { status } = await rpc("creditcoin", call("eth_sendRawTransaction"));
      expect(status).toBe(403);
    });

    test("admits no method that can submit a transaction", async () => {
      for (const m of ["eth_sendTransaction", "eth_sendRawTransaction"]) {
        expect(ALLOWED).not.toContain(m);
      }
    });
  });

  describe("forwarding", () => {
    test("passes the body through unchanged", async () => {
      const body = call("eth_call", [{ to: "0x1", data: "0x2" }, "latest"]);
      await rpc("sepolia", body);
      expect(upstream.calls[0].body).toEqual(body);
    });

    test("passes a batch through unchanged", async () => {
      const body = [call("eth_chainId"), call("eth_blockNumber")];
      await rpc("sepolia", body);
      expect(upstream.calls[0].body).toEqual(body);
    });

    test("sends JSON upstream", async () => {
      await rpc("sepolia", call("eth_chainId"));
      expect(upstream.calls[0].headers["content-type"]).toBe("application/json");
    });

    test("returns the upstream body verbatim", async () => {
      upstream.body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x18ec7" });
      const { body } = await rpc("sepolia", call("eth_chainId"));
      expect(body.result).toBe("0x18ec7");
    });

    test("passes an upstream error status through", async () => {
      upstream.status = 429;
      const { status } = await rpc("sepolia", call("eth_chainId"));
      expect(status).toBe(429);
    });

    test("labels the response as JSON", async () => {
      const { POST } = await route();
      const res = await POST(
        post("/api/rpc/sepolia", call("eth_chainId"), { "x-forwarded-for": nextIp() }),
        ctx({ chain: "sepolia" }),
      );
      expect(res.headers.get("content-type")).toBe("application/json");
    });

    test("forbids caching a chain read", async () => {
      const { POST } = await route();
      const res = await POST(
        post("/api/rpc/sepolia", call("eth_chainId"), { "x-forwarded-for": nextIp() }),
        ctx({ chain: "sepolia" }),
      );
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    test("502s when the upstream is unreachable", async () => {
      upstream.throws = Object.assign(new Error("connect ECONNREFUSED"), { name: "TypeError" });
      const { status, body } = await rpc("sepolia", call("eth_chainId"));
      expect(status).toBe(502);
      expect(body.error?.code).toBe(-32603);
    });

    test("reports only the failure's name — the URL carries the API key", async () => {
      upstream.throws = Object.assign(new Error(`failed to reach ${UPSTREAM}`), {
        name: "TimeoutError",
      });
      const { body } = await rpc("sepolia", call("eth_chainId"));
      expect(body.error?.message).toContain("TimeoutError");
      expect(body.error?.message).not.toContain("SECRET_KEY");
    });

    test("never echoes the upstream URL on any error path", async () => {
      upstream.throws = new Error(UPSTREAM);
      const { body } = await rpc("sepolia", call("eth_chainId"));
      expect(JSON.stringify(body)).not.toContain("SECRET_KEY");
    });

    test("never echoes the upstream URL on a refusal either", async () => {
      const { body } = await rpc("sepolia", call("eth_sendTransaction"));
      expect(JSON.stringify(body)).not.toContain("SECRET_KEY");
    });
  });

  describe("the per-IP budget", () => {
    test("allows a normal amount of polling", async () => {
      const ip = nextIp();
      for (let i = 0; i < 50; i++) {
        const { status } = await rpc("sepolia", call("eth_call"), { "x-forwarded-for": ip });
        expect(status).toBe(200);
      }
    });

    test("429s past six hundred calls in a minute", async () => {
      const ip = nextIp();
      let last = 200;
      for (let i = 0; i < 601; i++) {
        last = (await rpc("sepolia", call("eth_call"), { "x-forwarded-for": ip })).status;
      }
      expect(last).toBe(429);
    });

    test("tells the caller when to come back", async () => {
      const ip = nextIp();
      const { POST } = await route();
      let res!: Response;
      for (let i = 0; i < 601; i++) {
        res = await POST(
          post("/api/rpc/sepolia", call("eth_call"), { "x-forwarded-for": ip }),
          ctx({ chain: "sepolia" }),
        );
      }
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("30");
    });

    test("uses the JSON-RPC rate-limit code", async () => {
      const ip = nextIp();
      let body: Body = {};
      for (let i = 0; i < 601; i++) {
        body = (await rpc("sepolia", call("eth_call"), { "x-forwarded-for": ip })).body;
      }
      expect(body.error?.code).toBe(-32005);
    });

    test("does not spend another visitor's budget", async () => {
      const noisy = nextIp();
      for (let i = 0; i < 601; i++) {
        await rpc("sepolia", call("eth_call"), { "x-forwarded-for": noisy });
      }
      const quiet = await rpc("sepolia", call("eth_call"), { "x-forwarded-for": nextIp() });
      expect(quiet.status).toBe(200);
    });

    test("reads the first address in a forwarded chain", async () => {
      const mine = nextIp();
      for (let i = 0; i < 601; i++) {
        await rpc("sepolia", call("eth_call"), {
          "x-forwarded-for": `${mine}, 172.16.0.1, 172.16.0.2`,
        });
      }
      const { status } = await rpc("sepolia", call("eth_call"), {
        "x-forwarded-for": `${mine}, 203.0.113.9`,
      });
      expect(status).toBe(429);
    });

    test("falls back to x-real-ip", async () => {
      const ip = nextIp();
      for (let i = 0; i < 601; i++) {
        await rpc("sepolia", call("eth_call"), { "x-real-ip": ip });
      }
      const { status } = await rpc("sepolia", call("eth_call"), { "x-real-ip": ip });
      expect(status).toBe(429);
    });

    test("checks the allowlist before the budget, so a refusal is never a rate limit", async () => {
      const ip = nextIp();
      for (let i = 0; i < 700; i++) {
        await rpc("sepolia", call("eth_sendTransaction"), { "x-forwarded-for": ip });
      }
      const { status } = await rpc("sepolia", call("eth_sendTransaction"), {
        "x-forwarded-for": ip,
      });
      expect(status).toBe(403);
    });

    test("counts a batch as one call against the budget", async () => {
      const ip = nextIp();
      for (let i = 0; i < 30; i++) {
        await rpc("sepolia", Array.from({ length: 20 }, () => call("eth_call")), {
          "x-forwarded-for": ip,
        });
      }
      const { status } = await rpc("sepolia", call("eth_call"), { "x-forwarded-for": ip });
      expect(status).toBe(200);
    });
  });
});
