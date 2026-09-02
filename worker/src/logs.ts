/**
 * Log queries that survive a provider's block-range cap.
 *
 * @remarks Alchemy's free tier rejects any `eth_getLogs` spanning more than 10 blocks. This is not
 * an edge case to handle later: `collectRaceLocks` is the prover's input path, and it was querying
 * 2000 blocks at once, so on the RPC plan this project actually runs on it failed outright. The fix
 * is to stop scanning speculatively — the vault already records each lock's block number in state,
 * so read that first and query logs only across the blocks that provably contain locks.
 */
import { ethers } from "ethers";
import { env } from "./config";

/** Provider cap on `eth_getLogs` span, in blocks. Alchemy free tier is 10. */
export const MAX_LOG_RANGE = Number(env.MAX_LOG_RANGE ?? 10);

/**
 * Query logs across an arbitrary range, in chunks the provider will accept.
 *
 * @param maxSpan inclusive block span per request; defaults to the configured provider cap
 */
export async function queryLogsChunked(
  contract: ethers.Contract,
  filter: ethers.ContractEventName | ethers.DeferredTopicFilter,
  fromBlock: number,
  toBlock: number,
  maxSpan: number = MAX_LOG_RANGE,
): Promise<(ethers.Log | ethers.EventLog)[]> {
  if (toBlock < fromBlock) return [];
  const out: (ethers.Log | ethers.EventLog)[] = [];

  for (let start = fromBlock; start <= toBlock; start += maxSpan) {
    const end = Math.min(start + maxSpan - 1, toBlock);
    out.push(...(await contract.queryFilter(filter, start, end)));
  }
  return out;
}

/**
 * Collapse a set of block numbers into the ranges worth querying.
 *
 * @remarks Locks in one race cluster tightly — usually two or three adjacent blocks — so querying
 * the gaps between them wastes requests against a rate limit that is already the binding
 * constraint. Blocks within `maxSpan` of each other are merged into one range.
 */
export function coalesceRanges(blocks: number[], maxSpan: number = MAX_LOG_RANGE): [number, number][] {
  if (blocks.length === 0) return [];
  const sorted = [...new Set(blocks)].sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  let lo = sorted[0];
  let hi = sorted[0];

  for (const b of sorted.slice(1)) {
    if (b - lo < maxSpan) {
      hi = b;
    } else {
      ranges.push([lo, hi]);
      lo = b;
      hi = b;
    }
  }
  ranges.push([lo, hi]);
  return ranges;
}
