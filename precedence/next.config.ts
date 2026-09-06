import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

/**
 * Load the repo-root `.env.local` before Next boots.
 *
 * @remarks Next only reads `.env.local` from its OWN directory, but this project keeps one env
 * file at the repo root because the contracts, the worker and the app all share the same keys and
 * addresses — duplicating them is how a vault address ends up mistyped in one copy.
 *
 * Without this, `bun run dev` silently ran with no `PRECEDENCE_MODE`, no `PRECEDENCE_RUNTIME` and
 * no `GEMINI_API_KEY`: the app reported every adapter as simulated and the document reader as "no
 * model configured", while the file defining all three sat one directory up. It only ever worked
 * when the env was sourced into the shell by hand, which is not something a reader should have to
 * know.
 *
 * Values already in the environment win, so an explicit `PRECEDENCE_MODE=mock bun run dev` still
 * overrides the file.
 */

/**
 * The value of an env line, with any trailing comment removed.
 *
 * @remarks This parser used to strip quotes and stop, which quietly corrupted every key in the
 * file that carries an explanatory comment — and in this file that is all seven private keys:
 *
 *     PROVER_CC3_PK=0x…f8   # permissionless prover — deliberately NOT the deployer
 *
 * `process.env.PROVER_CC3_PK` then held the hex AND the sentence. The worker prefers `process.env`
 * over its own correct parse of the same file, so the polluted value won there too, and ethers
 * rejected it as `invalid BytesLike value` — an error that names the symptom and gives no hint
 * that a comment is the cause. Every signing path was affected: the prover, the keeper, and the
 * server-side Sepolia roles.
 *
 * It only ever worked when the env had already been sourced into the shell, because a shell
 * strips the comment itself and this function skips keys that are already set. That is also why it
 * survived testing.
 *
 * A `#` is a comment only when it follows whitespace or opens the value, so a value that legally
 * contains one (`pass#word`) is kept whole. A quoted value is taken verbatim, since a `#` inside
 * quotes is data.
 */
function envValue(raw: string): string {
  const v = raw.trim();
  const q = v[0];
  if (q === '"' || q === "'") {
    const end = v.indexOf(q, 1);
    if (end > 0) return v.slice(1, end);
    return v.slice(1);
  }
  const hash = v.search(/(^|\s)#/);
  return (hash >= 0 ? v.slice(0, hash) : v).trim();
}

function loadRootEnv(): void {
  const file = resolve(process.cwd(), "..", ".env.local");
  if (!existsSync(file)) return;

  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = envValue(line.slice(eq + 1));
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadRootEnv();

/**
 * Where the API lives, when it does not live here.
 *
 * @remarks Set on the Vercel deployment and nowhere else. The frontend and the API are one Next
 * app in this repo, but they cannot both run on Vercel: the store is a JSON file on disk, the
 * prover spawns the worker as a child process, and `getDeps()` reads
 * `../contracts/deployments/*.json` — none of which exist on a serverless filesystem. An API route
 * running there falls back to the mock adapters and the app reports every chain as simulated, which
 * is the honest answer to a broken configuration and a useless thing to show a judge.
 *
 * So Vercel serves the pages and proxies every `/api/*` call to a real machine that has all three.
 * Every page in this app is a client component and only the layouts render on the server, and they
 * touch neither config nor the store — so nothing on the Vercel side needs any of it.
 */
const API_ORIGIN = process.env.PRECEDENCE_API_ORIGIN?.trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  /**
   * Proxy the API to `PRECEDENCE_API_ORIGIN`, when one is configured.
   *
   * @remarks `beforeFiles` is load-bearing and the reason this is not a two-line config. From the
   * Next docs: a `rewrites()` that returns a plain ARRAY is "applied after checking the filesystem
   * (pages and /public files)". This app has real `app/api/*` route handlers, so an array rewrite
   * for `/api/:path*` loses to them every time — the proxy would never fire, Vercel would answer
   * from its own mock-mode adapters, and the only symptom would be an app quietly claiming both
   * chains are simulated. `beforeFiles` is checked "before all files", which is the only placement
   * that actually overrides a route handler.
   */
  async rewrites() {
    if (!API_ORIGIN) return [];
    return {
      beforeFiles: [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }],
      afterFiles: [],
      fallback: [],
    };
  },

  /**
   * Compile the wallet stack in-app rather than as pre-built externals.
   *
   * @remarks Guards against `WagmiProviderNotFoundError` during Next 16 static generation.
   * RainbowKit ships every chunk marked `'use client'` and externalises wagmi, so a page that
   * imports wagmi hooks directly AND RainbowKit components can make Next compile
   * `wagmi/.../context.js` twice in one SSG worker — two `createContext()` identities, and the
   * provider is invisible to half the tree. It is concurrency-sensitive: latent on a single-worker
   * local build, and surfaces on a parallel CI build, which is the worst possible time to find it.
   * See rainbow-me/rainbowkit#2673.
   */
  transpilePackages: ["@rainbow-me/rainbowkit", "wagmi", "@wagmi/core", "@wagmi/connectors"],
};

export default nextConfig;
