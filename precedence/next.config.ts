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
function loadRootEnv(): void {
  const file = resolve(process.cwd(), "..", ".env.local");
  if (!existsSync(file)) return;

  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadRootEnv();

const nextConfig: NextConfig = {
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
