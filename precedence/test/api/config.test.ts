/**
 * `GET /api/config` — the adapter truth disclosure.
 *
 * @remarks This route is the honesty mechanism's public face. Everything the UI claims about
 * provenance comes from here, so the tests worth having are the ones that catch it claiming too
 * much: `mode` must be derived from what the adapters report about themselves and never from the
 * env var that was *requested*, and the misrouting canary must fire rather than answer with
 * mock data that a judge would read as a configuration choice.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { deps, resetFakes } from "../helpers/fakes";
import { freshStore } from "../helpers/fixtures";
import { json } from "../helpers/http";

const route = () => import("@/app/api/config/route");

interface ConfigBody {
  ok?: boolean;
  mode?: string;
  requestedMode?: string;
  misconfigured?: string;
  error?: string;
  expectedApiOrigin?: string;
  sepolia?: { requested: string; live: boolean; note: string };
  creditcoin?: { requested: string; live: boolean; note: string };
  runtime?: string;
  store?: { persistent: boolean; path: string | null };
  explorers?: { sepolia: string; creditcoin: string };
  proofBuilderUrl?: string;
  addresses?: Record<string, unknown>;
  chainIds?: { sepolia: number; creditcoin: number };
}

describe("GET /api/config", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
    delete process.env.PRECEDENCE_API_ORIGIN;
  });

  afterEach(() => {
    delete process.env.PRECEDENCE_API_ORIGIN;
    process.env.PRECEDENCE_MODE = "mock";
    process.env.PRECEDENCE_SEPOLIA = "mock";
    process.env.PRECEDENCE_CREDITCOIN = "mock";
    process.env.PRECEDENCE_RUNTIME = "local";
  });

  describe("mode, derived from the adapters and not from the env", () => {
    test("answers 200 when nothing is misconfigured", async () => {
      const { GET } = await route();
      expect((await GET()).status).toBe(200);
    });

    test("reports mock when neither adapter is live", async () => {
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.mode).toBe("mock");
    });

    test("reports chain when both adapters are live", async () => {
      deps.sepoliaLive = true;
      deps.creditcoinLive = true;
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.mode).toBe("chain");
    });

    test("reports mixed when only Sepolia is live", async () => {
      deps.sepoliaLive = true;
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.mode).toBe("mixed");
    });

    test("reports mixed when only Creditcoin is live", async () => {
      deps.creditcoinLive = true;
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.mode).toBe("mixed");
    });

    test("does not read mode from PRECEDENCE_MODE — the bug this route had", async () => {
      // `chain` requested, adapters not live. Reporting the request would be the dishonest answer.
      process.env.PRECEDENCE_MODE = "chain";
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.mode).toBe("mock");
      expect(body.requestedMode).toBe("chain");
    });

    test("keeps the requested mode visible beside the derived one", async () => {
      process.env.PRECEDENCE_MODE = "mock";
      deps.sepoliaLive = true;
      deps.creditcoinLive = true;
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.requestedMode).toBe("mock");
      expect(body.mode).toBe("chain");
    });

    test("accepts the legacy `viem` value as an alias for chain", async () => {
      process.env.PRECEDENCE_MODE = "viem";
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.requestedMode).toBe("chain");
    });

    test("falls back to mock for an unrecognised mode rather than throwing", async () => {
      process.env.PRECEDENCE_MODE = "banana";
      const { GET } = await route();
      const res = await GET();
      expect(res.status).toBe(200);
      expect((await res.json()).requestedMode).toBe("mock");
    });
  });

  describe("per-adapter disclosure", () => {
    test("reports each adapter's own liveness separately", async () => {
      deps.sepoliaLive = true;
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.sepolia?.live).toBe(true);
      expect(body.creditcoin?.live).toBe(false);
    });

    test("carries the note explaining why an adapter is in its mode", async () => {
      deps.notes = { sepolia: "SEPOLIA_RPC is not set", creditcoin: "deployments file missing" };
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.sepolia?.note).toBe("SEPOLIA_RPC is not set");
      expect(body.creditcoin?.note).toBe("deployments file missing");
    });

    test("reports the per-adapter override rather than the master switch", async () => {
      process.env.PRECEDENCE_MODE = "mock";
      process.env.PRECEDENCE_SEPOLIA = "chain";
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.sepolia?.requested).toBe("chain");
      expect(body.creditcoin?.requested).toBe("mock");
    });

    test("an adapter with no override inherits the master switch", async () => {
      process.env.PRECEDENCE_MODE = "chain";
      delete process.env.PRECEDENCE_SEPOLIA;
      delete process.env.PRECEDENCE_CREDITCOIN;
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.sepolia?.requested).toBe("chain");
      expect(body.creditcoin?.requested).toBe("chain");
    });
  });

  describe("the rest of the disclosure", () => {
    test("reports the runtime mode", async () => {
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.runtime).toBe("local");
    });

    test("reports the agent runtime when one is selected", async () => {
      process.env.PRECEDENCE_RUNTIME = "agent";
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.runtime).toBe("agent");
    });

    test("reports a non-persistent store when PRECEDENCE_STORE_PATH is unset", async () => {
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.store?.persistent).toBe(false);
      expect(body.store?.path).toBeNull();
    });

    test("names both explorers", async () => {
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.explorers?.sepolia).toBe("https://sepolia.etherscan.io");
      expect(body.explorers?.creditcoin).toBe("https://creditcoin-testnet.blockscout.com");
    });

    test("never names the explorer host that does not resolve", async () => {
      // `explorer.cc3-testnet.creditcoin.network` is documented but dead. A dead explorer link
      // in front of a judge ends the submission, so it must not be reachable from here.
      const { GET } = await route();
      const body = JSON.stringify(await (await GET()).json());
      expect(body).not.toContain("explorer.cc3-testnet.creditcoin.network");
    });

    test("names the canonical proof builder", async () => {
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.proofBuilderUrl).toBe(
        "https://proof-gen-api.cc3-testnet.creditcoin.network",
      );
    });

    test("reports both chain ids exactly", async () => {
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.chainIds).toEqual({ sepolia: 11155111, creditcoin: 102031 });
    });

    test("omits addresses entirely when nothing is deployed", async () => {
      deps.addresses = {};
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.addresses).toEqual({});
    });

    test("passes deployed addresses through for the browser to read the vault", async () => {
      deps.addresses = {
        sepolia: { PUSD: "0x" + "1".repeat(40), PriorityVault: "0x" + "2".repeat(40) },
      } as never;
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect((body.addresses as never as { sepolia: { PriorityVault: string } }).sepolia.PriorityVault).toBe(
        "0x" + "2".repeat(40),
      );
    });

    test("never leaks an RPC URL, which carries the API key", async () => {
      deps.config = { sepoliaRpc: "https://rpc.test-upstream.invalid/SECRET_KEY" };
      const { GET } = await route();
      const body = JSON.stringify(await (await GET()).json());
      expect(body).not.toContain("SECRET_KEY");
    });
  });

  describe("the misrouting canary", () => {
    test("returns 503 rather than mock data when PRECEDENCE_API_ORIGIN is set", async () => {
      process.env.PRECEDENCE_API_ORIGIN = "https://api.example.test";
      const { GET } = await route();
      expect((await GET()).status).toBe(503);
    });

    test("names the failure so it cannot be mistaken for a mode choice", async () => {
      process.env.PRECEDENCE_API_ORIGIN = "https://api.example.test";
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.ok).toBe(false);
      expect(body.misconfigured).toBe("api-rewrite-not-applied");
    });

    test("reports no mode at all, so the UI cannot render a provenance claim", async () => {
      process.env.PRECEDENCE_API_ORIGIN = "https://api.example.test";
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.mode).toBeUndefined();
    });

    test("echoes the origin the deployment expected", async () => {
      process.env.PRECEDENCE_API_ORIGIN = "https://api.example.test";
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.expectedApiOrigin).toBe("https://api.example.test");
    });

    test("strips a trailing slash from the origin", async () => {
      process.env.PRECEDENCE_API_ORIGIN = "https://api.example.test/";
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.expectedApiOrigin).toBe("https://api.example.test");
    });

    test("strips repeated trailing slashes", async () => {
      process.env.PRECEDENCE_API_ORIGIN = "https://api.example.test///";
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.expectedApiOrigin).toBe("https://api.example.test");
    });

    test("trims surrounding whitespace", async () => {
      process.env.PRECEDENCE_API_ORIGIN = "  https://api.example.test  ";
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.expectedApiOrigin).toBe("https://api.example.test");
    });

    test("points at the two things that actually cause it", async () => {
      process.env.PRECEDENCE_API_ORIGIN = "https://api.example.test";
      const { GET } = await route();
      const { body } = await json<ConfigBody>(await GET());
      expect(body.error).toContain("beforeFiles");
      expect(body.error).toContain("build time");
    });

    test("stays quiet when the variable is empty", async () => {
      process.env.PRECEDENCE_API_ORIGIN = "";
      const { GET } = await route();
      expect((await GET()).status).toBe(200);
    });

    test("stays quiet when the variable is only whitespace", async () => {
      process.env.PRECEDENCE_API_ORIGIN = "   ";
      const { GET } = await route();
      expect((await GET()).status).toBe(200);
    });

    test("fires ahead of the mode derivation, so a live adapter cannot mask it", async () => {
      deps.sepoliaLive = true;
      deps.creditcoinLive = true;
      process.env.PRECEDENCE_API_ORIGIN = "https://api.example.test";
      const { GET } = await route();
      const { status, body } = await json<ConfigBody>(await GET());
      expect(status).toBe(503);
      expect(body.mode).toBeUndefined();
    });
  });
});
