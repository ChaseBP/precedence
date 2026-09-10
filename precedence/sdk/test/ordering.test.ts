/**
 * The trust root: priority by proven source-block position.
 *
 * @remarks `compareProvenOrder` is the one function the whole protocol's claim rests on, so this
 * file is mostly about the case that motivates it. Two locks in the same block cannot be ordered
 * by height, and an oracle asserting an order there is exactly what PRECEDENCE replaces — the
 * transaction index inside the block is the other half of the position, and on Creditcoin it is
 * re-derived from the Merkle path by `calculateTxIndex` rather than taken from anybody's word.
 *
 * `checkSeqContiguity` and `checkStrictOrdering` mirror the on-chain gate. They exist so a prover
 * finds out locally that a submission would be rejected, instead of finding out by spending gas.
 */
import { describe, expect, test } from "bun:test";
import {
  checkSeqContiguity,
  checkStrictOrdering,
  compareProvenOrder,
  sortByProvenOrder,
} from "../src/domain/lock";
import { lock, sameBlockRace, tx } from "./helpers";

describe("compareProvenOrder", () => {
  test("orders by block height first", () => {
    const a = lock({ lockBlockNumber: 100, lockTxIndex: 999 });
    const b = lock({ lockBlockNumber: 101, lockTxIndex: 0 });
    expect(compareProvenOrder(a, b)).toBeLessThan(0);
  });

  test("a lower block wins however high its index", () => {
    const early = lock({ lockBlockNumber: 100, lockTxIndex: 4_000 });
    const late = lock({ lockBlockNumber: 200, lockTxIndex: 1 });
    expect(sortByProvenOrder([late, early])[0]).toBe(early);
  });

  test("breaks a same-block tie by transaction index — the case the protocol exists for", () => {
    const first = lock({ lockBlockNumber: 100, lockTxIndex: 17 });
    const second = lock({ lockBlockNumber: 100, lockTxIndex: 18 });
    expect(compareProvenOrder(first, second)).toBeLessThan(0);
  });

  test("index zero is a real position, not an absence", () => {
    const at0 = lock({ lockBlockNumber: 100, lockTxIndex: 0, seq: 1 });
    const at1 = lock({ lockBlockNumber: 100, lockTxIndex: 1, seq: 2 });
    expect(compareProvenOrder(at0, at1)).toBeLessThan(0);
  });

  test("falls back to the vault's seq only when height AND index are identical", () => {
    // Not a reachable state on one chain — two transactions cannot share a position — so this is
    // a consistency assertion rather than a tie-break.
    const a = lock({ lockBlockNumber: 100, lockTxIndex: 5, seq: 1 });
    const b = lock({ lockBlockNumber: 100, lockTxIndex: 5, seq: 2 });
    expect(compareProvenOrder(a, b)).toBeLessThan(0);
  });

  test("is zero only for a lock compared with itself", () => {
    const a = lock();
    expect(compareProvenOrder(a, a)).toBe(0);
  });

  test("is antisymmetric", () => {
    const a = lock({ lockTxIndex: 17 });
    const b = lock({ lockTxIndex: 41 });
    expect(Math.sign(compareProvenOrder(a, b))).toBe(-Math.sign(compareProvenOrder(b, a)));
  });

  test("ignores the wall-clock timestamp entirely", () => {
    // When someone clicked has nothing to do with where their transaction landed.
    const clickedFirst = lock({ lockTxIndex: 90, timestamp: "2020-01-01T00:00:00.000Z" });
    const clickedLater = lock({ lockTxIndex: 12, timestamp: "2030-01-01T00:00:00.000Z" });
    expect(sortByProvenOrder([clickedFirst, clickedLater])[0]).toBe(clickedLater);
  });

  test("ignores the amount locked", () => {
    const small = lock({ lockTxIndex: 5, amountUsd: 1 });
    const large = lock({ lockTxIndex: 6, amountUsd: 10_000_000 });
    expect(sortByProvenOrder([large, small])[0]).toBe(small);
  });
});

describe("sortByProvenOrder", () => {
  test("leaves the input array untouched", () => {
    const locks = sameBlockRace();
    const before = locks.map((l) => l.financier);
    sortByProvenOrder([...locks].reverse());
    expect(locks.map((l) => l.financier)).toEqual(before);
  });

  test("returns a new array", () => {
    const locks = sameBlockRace();
    expect(sortByProvenOrder(locks)).not.toBe(locks);
  });

  test("ranks the same-block race by index", () => {
    const ranked = sortByProvenOrder(sameBlockRace().reverse());
    expect(ranked.map((l) => l.financier)).toEqual(["meridian", "vector", "novum"]);
  });

  test("is stable across input orderings", () => {
    const a = sortByProvenOrder(sameBlockRace()).map((l) => l.seq);
    const b = sortByProvenOrder(sameBlockRace().reverse()).map((l) => l.seq);
    expect(a).toEqual(b);
  });

  test("handles an empty set", () => {
    expect(sortByProvenOrder([])).toEqual([]);
  });

  test("handles a single lock", () => {
    const one = [lock()];
    expect(sortByProvenOrder(one)).toHaveLength(1);
  });

  test("orders a race that legitimately spans blocks", () => {
    const locks = [
      lock({ lockBlockNumber: 300, lockTxIndex: 1, seq: 3, sepoliaTxHash: tx(3) }),
      lock({ lockBlockNumber: 100, lockTxIndex: 99, seq: 1, sepoliaTxHash: tx(1) }),
      lock({ lockBlockNumber: 200, lockTxIndex: 50, seq: 2, sepoliaTxHash: tx(2) }),
    ];
    expect(sortByProvenOrder(locks).map((l) => l.lockBlockNumber)).toEqual([100, 200, 300]);
  });
});

describe("checkSeqContiguity — the completeness requirement the gate enforces", () => {
  test("accepts a contiguous set from one", () => {
    expect(checkSeqContiguity(sameBlockRace()).ok).toBe(true);
  });

  test("accepts an out-of-order but complete set", () => {
    expect(checkSeqContiguity(sameBlockRace().reverse()).ok).toBe(true);
  });

  test("accepts an empty set", () => {
    // Nothing to prove is not the same as an incomplete proof.
    expect(checkSeqContiguity([]).ok).toBe(true);
  });

  test("rejects a set that omits a MIDDLE lock", () => {
    // The attack this exists to stop: dropping a rival to promote a friend.
    const locks = sameBlockRace().filter((l) => l.seq !== 2);
    const r = checkSeqContiguity(locks);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("not contiguous from 1");
  });

  test("rejects a set that omits the FIRST lock", () => {
    const locks = sameBlockRace().filter((l) => l.seq !== 1);
    expect(checkSeqContiguity(locks).ok).toBe(false);
  });

  test("names the position where the gap is", () => {
    const locks = sameBlockRace().filter((l) => l.seq !== 2);
    expect(checkSeqContiguity(locks).reason).toContain("position 2");
  });

  test("accepts a truncated TAIL, which is the only safe omission", () => {
    // A truncated tail drops later — more junior — locks, and their holders can prove their own.
    const locks = sameBlockRace().filter((l) => l.seq <= 2);
    expect(checkSeqContiguity(locks).ok).toBe(true);
  });

  test("rejects a set that starts at two", () => {
    expect(checkSeqContiguity([lock({ seq: 2 })]).ok).toBe(false);
  });

  test("rejects a duplicated seq", () => {
    const locks = [lock({ seq: 1 }), lock({ seq: 1, sepoliaTxHash: tx(2) })];
    expect(checkSeqContiguity(locks).ok).toBe(false);
  });

  test("rejects a zero seq, because the vault counts from one", () => {
    expect(checkSeqContiguity([lock({ seq: 0 })]).ok).toBe(false);
  });
});

describe("checkStrictOrdering — the gate's monotonicity requirement", () => {
  test("accepts a strictly increasing set", () => {
    expect(checkStrictOrdering(sortByProvenOrder(sameBlockRace())).ok).toBe(true);
  });

  test("accepts an empty set", () => {
    expect(checkStrictOrdering([]).ok).toBe(true);
  });

  test("accepts a single lock", () => {
    expect(checkStrictOrdering([lock()]).ok).toBe(true);
  });

  test("rejects a set the prover reordered", () => {
    const r = checkStrictOrdering(sortByProvenOrder(sameBlockRace()).reverse());
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("strictly increasing");
  });

  test("rejects two locks at the same position", () => {
    const dup = [lock({ seq: 1 }), lock({ seq: 1, sepoliaTxHash: tx(2) })];
    expect(checkStrictOrdering(dup).ok).toBe(false);
  });

  test("names the pair that breaks it", () => {
    const r = checkStrictOrdering([lock({ lockTxIndex: 40 }), lock({ lockTxIndex: 10, seq: 2 })]);
    expect(r.reason).toContain("locks 0 and 1");
  });

  test("says the gate would reject it, rather than only that it is unsorted", () => {
    const r = checkStrictOrdering([lock({ lockTxIndex: 40 }), lock({ lockTxIndex: 10, seq: 2 })]);
    expect(r.reason).toContain("gate would reject");
  });

  test("accepts same-block locks that differ only by index", () => {
    const locks = [
      lock({ lockBlockNumber: 100, lockTxIndex: 1, seq: 1 }),
      lock({ lockBlockNumber: 100, lockTxIndex: 2, seq: 2, sepoliaTxHash: tx(2) }),
    ];
    expect(checkStrictOrdering(locks).ok).toBe(true);
  });

  test("rejects a descending block even with ascending indices", () => {
    const locks = [
      lock({ lockBlockNumber: 200, lockTxIndex: 1, seq: 1 }),
      lock({ lockBlockNumber: 100, lockTxIndex: 2, seq: 2, sepoliaTxHash: tx(2) }),
    ];
    expect(checkStrictOrdering(locks).ok).toBe(false);
  });

  test("the two checks are independent — a set can pass one and fail the other", () => {
    const reordered = sortByProvenOrder(sameBlockRace()).reverse();
    expect(checkSeqContiguity(reordered).ok).toBe(true);
    expect(checkStrictOrdering(reordered).ok).toBe(false);
  });
});
