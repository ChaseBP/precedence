/**
 * Watch the source chain for locks and settle each race once its window closes.
 *
 * @dev The batching rule here is not arbitrary. One continuity proof covers at most 10
 * transactions inside a 1000-block window, and verification cost grows with proof AGE, so a race is
 * proven as soon as its window closes rather than accumulated. Waiting an hour to batch more would
 * cost roughly ten times as much per proof.
 *
 * Uses `queryFilter` polling rather than a WebSocket subscription: the Alchemy HTTPS endpoint is
 * what we have, and a poll that misses a block can be re-run over the same range idempotently,
 * whereas a dropped subscription silently loses events.
 *
 * @dev Lock POSITIONS come from vault state, not from a log scan. The provider caps `eth_getLogs`
 * at a 10-block span, so scanning back over a wide range fails outright; and the vault already
 * knows which block each lock landed in. State answers "where", logs then answer "which
 * transaction" across only the blocks that provably contain locks. See `logs.ts`.
 */
import { ethers } from "ethers";
import { gate, sepoliaProvider, vault } from "./config";
import { coalesceRanges, queryLogsChunked } from "./logs";
import { settleRace } from "./settle-race";

export interface WatchedLock {
  collateralId: string;
  financier: string;
  tranche: number;
  amount: bigint;
  raceNonce: number;
  seq: number;
  txHash: string;
  blockNumber: number;
  txIndex: number;
}

/** Read every lock for one race directly from the vault's logs. */
export async function collectRaceLocks(
  collateralId: string,
  raceNonce?: number,
  fromBlock?: number,
): Promise<WatchedLock[]> {
  const vaultC = vault();
  const sepolia = sepoliaProvider();

  const nonce = raceNonce ?? Number((await vaultC.getCollateral(collateralId)).raceNonce);
  const filter = vaultC.filters.Lock_(collateralId);

  // Ask the vault where its locks are, rather than hunting for them.
  const count = Number(await vaultC.lockCountOf(collateralId));
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const l = await vaultC.lockAtRace(collateralId, nonce, i);
    positions.push(Number(l.blockNumber));
  }

  let logs: Awaited<ReturnType<typeof queryLogsChunked>> = [];
  if (positions.length > 0) {
    for (const [lo, hi] of coalesceRanges(positions)) {
      logs.push(...(await queryLogsChunked(vaultC, filter, lo, hi)));
    }
  } else if (fromBlock !== undefined) {
    // No state to guide us: an explicit range was asked for, so honour it in provider-sized chunks.
    const head = await sepolia.getBlockNumber();
    logs = await queryLogsChunked(vaultC, filter, fromBlock, head);
  }

  const locks: WatchedLock[] = [];
  for (const log of logs) {
    const ev = log as ethers.EventLog;
    const evNonce = Number(ev.args.raceNonce);
    if (evNonce !== nonce) continue;
    locks.push({
      collateralId,
      financier: ev.args.financier as string,
      tranche: Number(ev.args.tranche),
      amount: ev.args.amount as bigint,
      raceNonce: evNonce,
      seq: Number(ev.args.seq),
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      // `ev.index` is the LOG index within the block, NOT the transaction index. Using it here
      // reported 167/169 for transactions the precompile and the explorer both place at 73/74.
      // Ordering happened to survive — log and transaction indices rise together — but the
      // numbers on screen contradicted the chain, which is worse than a crash.
      txIndex: ev.transactionIndex,
    });
  }

  // Proven order. The gate requires it, so establish it here.
  locks.sort((a, b) => (a.blockNumber !== b.blockNumber ? a.blockNumber - b.blockNumber : a.txIndex - b.txIndex));
  return locks;
}

/**
 * Sanity-check a lock set before spending minutes waiting for attestation.
 *
 * @dev Every condition below is one the gate enforces on-chain. Checking them here turns a wasted
 * ~8-minute wait plus a failed transaction into an immediate, readable error.
 */
export function validateLockSet(locks: WatchedLock[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (locks.length === 0) problems.push("no locks found for this race");
  if (locks.length > 10) problems.push(`${locks.length} locks exceeds MAX_BATCH_SIZE of 10`);

  if (locks.length > 0) {
    const nonces = new Set(locks.map((l) => l.raceNonce));
    if (nonces.size > 1) problems.push(`locks span multiple races (nonces ${[...nonces].join(", ")})`);

    const span = locks[locks.length - 1].blockNumber - locks[0].blockNumber;
    if (span > 1000) problems.push(`block span ${span} exceeds MAX_BATCH_RANGE of 1000`);

    locks.forEach((l, i) => {
      if (l.seq !== i + 1) {
        problems.push(`seq gap: position ${i + 1} has seq ${l.seq}. The gate requires 1..N contiguous.`);
      }
    });

    for (let i = 1; i < locks.length; i++) {
      const p = locks[i - 1];
      const c = locks[i];
      if (!(c.blockNumber > p.blockNumber || (c.blockNumber === p.blockNumber && c.txIndex > p.txIndex))) {
        problems.push(`locks ${i - 1}/${i} are not strictly increasing in (block, txIndex)`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

export interface WatchOptions {
  /** Collateral ids to watch. */
  collateralIds: string[];
  pollMs?: number;
  /** Settle automatically when a race closes, rather than only reporting. */
  autoSettle?: boolean;
  onEvent?: (msg: string) => void;
}

export async function runWatchLoop(opts: WatchOptions): Promise<void> {
  const say = opts.onEvent ?? ((m: string) => console.log(m));
  const vaultC = vault();
  const gateC = gate();
  const poll = opts.pollMs ?? 20_000;

  say(`watching ${opts.collateralIds.length} collateral id(s) every ${poll / 1000}s`);
  say(opts.autoSettle ? "auto-settle ON" : "auto-settle OFF — reporting only");

  const settled = new Set<string>();

  for (;;) {
    for (const id of opts.collateralIds) {
      try {
        const c = await vaultC.getCollateral(id);
        const nonce = Number(c.raceNonce);
        const key = `${id}:${nonce}`;

        if (nonce === 0) {
          say(`${id.slice(0, 12)}… no race opened yet`);
          continue;
        }

        const locks = await collectRaceLocks(id, nonce);
        const raceOpen = Boolean(c.raceOpen);

        if (raceOpen) {
          say(
            `${id.slice(0, 12)}… race ${nonce} OPEN · ${locks.length} lock(s) · ` +
              `deadline ${new Date(Number(c.raceDeadline) * 1000).toISOString()}`,
          );
          continue;
        }

        if (settled.has(key)) continue;

        // Already settled on Creditcoin? The gate's replay guard is the source of truth.
        if (locks.length > 0) {
          const done = await gateC.isProcessed(locks[0].blockNumber, locks[0].txIndex);
          if (done) {
            say(`${id.slice(0, 12)}… race ${nonce} already settled on Creditcoin`);
            settled.add(key);
            continue;
          }
        }

        const check = validateLockSet(locks);
        if (!check.ok) {
          say(`${id.slice(0, 12)}… race ${nonce} NOT settleable: ${check.problems.join("; ")}`);
          continue;
        }

        say(`${id.slice(0, 12)}… race ${nonce} CLOSED with ${locks.length} lock(s) — ready to prove`);

        if (opts.autoSettle) {
          const result = await settleRace({
            collateralId: id,
            txHashes: locks.map((l) => l.txHash),
            evidenceName: `race-${id.slice(2, 10)}-${nonce}`,
            onStage: (s, d) => say(`    [${s}] ${d}`),
          });
          say(`SETTLED ${result.settleTxHash} · ${result.explorerUrl}`);
          say(`evidence → ${result.evidencePath}`);
          if (!result.crossCheckAgrees) {
            say(`WARNING: precompile/explorer txIndex mismatch — investigate before using this run`);
          }
          settled.add(key);
        }
      } catch (e) {
        say(`error on ${id.slice(0, 12)}…: ${(e as Error).message.slice(0, 200)}`);
      }
    }
    await new Promise((r) => setTimeout(r, poll));
  }
}
