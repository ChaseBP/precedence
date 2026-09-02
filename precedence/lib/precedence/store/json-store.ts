/**
 * The store: in-memory with optional disk persistence.
 *
 * @remarks
 * The in-memory-only version this replaces lost everything on a process restart — including real,
 * already-verified on-chain evidence. That is fine for a fixture demo and unacceptable once a race
 * has cost real testnet gas: the Creditcoin transaction still exists, but the app would forget it
 * and show a judge nothing.
 *
 * Persistence is deliberately optional and best-effort:
 *
 *  - `PRECEDENCE_STORE_PATH` set  → writes through to that JSON file (a box, e.g. the Azure worker
 *    host). Loaded once at startup.
 *  - unset                        → memory only, which is correct for a read-only serverless
 *    deployment where the filesystem is ephemeral anyway.
 *
 * Writes are debounced and failures are swallowed with a warning. A read-only filesystem must
 * degrade to the in-memory behaviour rather than break the app — losing the durable copy is bad,
 * but a crashed request during a demo is worse. `evidence/` is the authoritative record of anything
 * that actually happened on-chain; this is the app's working state.
 */
import { DbShape, emptyDb } from "./schema";
import { seedDb } from "./seed";

const g = globalThis as unknown as {
  __precedenceDb?: DbShape;
  __precedenceFlush?: ReturnType<typeof setTimeout>;
  __precedenceDiskWarned?: boolean;
};

const STORE_PATH = process.env.PRECEDENCE_STORE_PATH;
const FLUSH_DEBOUNCE_MS = 250;

function warnOnce(msg: string): void {
  if (g.__precedenceDiskWarned) return;
  g.__precedenceDiskWarned = true;
  console.warn(`[precedence/store] ${msg}`);
}

/**
 * Node's `fs` is required lazily and behind a try/catch so this module stays importable from an
 * edge/browser bundle, where it simply behaves as memory-only.
 */
function fsOrNull() {
  if (!STORE_PATH) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:fs") as typeof import("node:fs");
  } catch {
    warnOnce("node:fs unavailable — running memory-only");
    return null;
  }
}

function loadFromDisk(): DbShape | null {
  const fs = fsOrNull();
  if (!fs || !STORE_PATH) return null;
  try {
    if (!fs.existsSync(STORE_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as Partial<DbShape>;
    // Merge onto an empty shape so a store written by an older version, missing a collection,
    // loads rather than producing undefined arrays deep inside a component.
    return { ...emptyDb(), ...parsed };
  } catch (e) {
    warnOnce(`could not read ${STORE_PATH} (${(e as Error).message}) — starting from seed`);
    return null;
  }
}

function writeToDisk(db: DbShape): void {
  const fs = fsOrNull();
  if (!fs || !STORE_PATH) return;
  try {
    const dir = STORE_PATH.replace(/\/[^/]+$/, "");
    if (dir && dir !== STORE_PATH && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Write-then-rename, so a crash mid-write cannot leave a truncated file that fails to parse.
    const tmp = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, STORE_PATH);
  } catch (e) {
    warnOnce(`could not write ${STORE_PATH} (${(e as Error).message}) — continuing memory-only`);
  }
}

/** Mark the store dirty. Debounced: a race emits many events in quick succession. */
export function persist(): void {
  if (!STORE_PATH || !g.__precedenceDb) return;
  if (g.__precedenceFlush) clearTimeout(g.__precedenceFlush);
  g.__precedenceFlush = setTimeout(() => {
    g.__precedenceFlush = undefined;
    if (g.__precedenceDb) writeToDisk(g.__precedenceDb);
  }, FLUSH_DEBOUNCE_MS);
}

/** Flush immediately. Used by the reset path, where the next read must see the new state. */
export function persistNow(): void {
  if (g.__precedenceFlush) {
    clearTimeout(g.__precedenceFlush);
    g.__precedenceFlush = undefined;
  }
  if (g.__precedenceDb) writeToDisk(g.__precedenceDb);
}

export function getDb(): DbShape {
  if (!g.__precedenceDb) {
    g.__precedenceDb = loadFromDisk() ?? seedDb();
  }
  return g.__precedenceDb;
}

export function resetDb(): DbShape {
  g.__precedenceDb = seedDb();
  persistNow();
  return g.__precedenceDb;
}

/** True when state survives a restart. Surfaced by `/api/config` so the UI never overclaims. */
export function isPersistent(): boolean {
  return Boolean(STORE_PATH && fsOrNull());
}

export function storePath(): string | undefined {
  return STORE_PATH;
}
