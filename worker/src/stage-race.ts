/**
 * Stage a priority race on the source chain: register, open, lock, close.
 *
 * @remarks This is demo *staging*, deliberately separate from `settle-race.ts`. Nothing here
 * proves anything — it only creates the source-chain facts that a proof will later attest to.
 * Keeping it separate is what makes the settlement path's inputs auditable: the prover reads locks
 * back out of the vault's own logs, it never trusts what this file believed it wrote.
 *
 * The `contend` mode fires the two bids that want the SAME tranche concurrently, so they land in
 * one Sepolia block. That is the case block height alone cannot order, and it is precisely what
 * `INativeQueryVerifier.calculateTxIndex` exists to resolve. A sequential run never exercises it.
 */
import { ethers } from "ethers";
import { env, explorers, loadDeployments, pusd, sepoliaSigner, vault } from "./config";

export type TrancheName = "SENIOR" | "JUNIOR" | "SUBORDINATE";
const TRANCHE_ORDINAL: Record<TrancheName, number> = { SENIOR: 0, JUNIOR: 1, SUBORDINATE: 2 };

export interface Bid {
  /** Label used in output, and the `FIN_<LABEL>_PK` env key that signs it. */
  label: string;
  tranche: TrancheName;
  /** Whole dollars; converted to the token's 6 decimals. */
  amountUsd: number;
}

export interface StageOptions {
  collateralId: string;
  /** Whole dollars the obligor is asking for. */
  facilityUsd: number;
  bids: Bid[];
  /** Race window in seconds. The vault enforces a 2-minute minimum. */
  windowSec?: number;
  /**
   * Fire same-tranche rivals concurrently so they contend inside one block.
   *
   * @remarks Truthful but non-deterministic: whoever the block orders first wins. Leave off for a
   * rehearsed demo, turn on to produce evidence that `calculateTxIndex` is load-bearing.
   */
  contend?: boolean;
  onStage?: (stage: string, detail: string) => void;
}

export interface StagedLock {
  label: string;
  financier: string;
  tranche: TrancheName;
  amountUsd: number;
  txHash: string;
  blockNumber: number;
  txIndex: number;
  seq: number;
}

const D = 1_000_000n;
const usd = (n: number) => BigInt(Math.round(n)) * D;
const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

function signerFor(label: string): ethers.Wallet {
  const key = `FIN_${label.toUpperCase()}_PK`;
  if (!env[key]) throw new Error(`no key ${key} in .env.local for bid label "${label}"`);
  return sepoliaSigner(key);
}

export async function stageRace(opts: StageOptions): Promise<StagedLock[]> {
  const say = opts.onStage ?? ((s: string, d: string) => console.log(`  [${s}] ${d}`));
  const d = loadDeployments();
  const obligor = sepoliaSigner("OBLIGOR_PK");
  const vaultAddr = d.sepolia.PriorityVault;
  const window = opts.windowSec ?? 150;

  // ── the vault binding must already agree with the registry, or the proof is unprovable ──
  say("vault", `${vaultAddr} — the address the Creditcoin registry is bound to`);

  const vaultAsObligor = vault(obligor);

  // ── register on the vault (idempotent: skip if already there) ──
  const existing = await vaultAsObligor.getCollateral(opts.collateralId);
  if (existing.obligor === ethers.ZeroAddress) {
    const tx = await vaultAsObligor.registerCollateral(opts.collateralId);
    await tx.wait();
    say("register", `collateral registered on the vault by ${obligor.address} · ${tx.hash}`);
  } else {
    if (existing.obligor.toLowerCase() !== obligor.address.toLowerCase()) {
      throw new Error(
        `vault already has this collateral under obligor ${existing.obligor}, not ${obligor.address}`,
      );
    }
    say("register", `already registered on the vault (race nonce ${existing.raceNonce})`);
  }

  // ── open the race ──
  if (existing.raceOpen) {
    say("open", `a race is ALREADY open — closing it first so seq restarts cleanly`);
    try {
      const c = await vaultAsObligor.closeRace(opts.collateralId);
      await c.wait();
    } catch (e) {
      throw new Error(
        `cannot close the open race yet (${(e as Error).message.slice(0, 120)}). ` +
          `Wait for its deadline to pass, then re-run.`,
      );
    }
  }
  const openTx = await vaultAsObligor.openRace(opts.collateralId, usd(opts.facilityUsd), window);
  const openRc = await openTx.wait();
  const c0 = await vaultAsObligor.getCollateral(opts.collateralId);
  const raceNonce = Number(c0.raceNonce);
  say(
    "open",
    `race ${raceNonce} open for ${fmt(opts.facilityUsd)} · ${window}s window · ` +
      `deadline ${new Date(Number(c0.raceDeadline) * 1000).toISOString()} · ${explorers.sepoliaTx(openTx.hash)}`,
  );
  say("open", `seq restarts at 1 for this race — contiguity is per-race, not per-collateral`);

  // ── approvals first, so the lock transactions are the only ones racing ──
  const signers = new Map<string, ethers.Wallet>();
  for (const b of opts.bids) signers.set(b.label, signerFor(b.label));

  await Promise.all(
    opts.bids.map(async (b) => {
      const s = signers.get(b.label)!;
      const token = pusd(s);
      const need = usd(b.amountUsd);
      const bal: bigint = await token.balanceOf(s.address);
      if (bal < need) {
        throw new Error(`${b.label} holds ${bal / D} pUSD but bids ${b.amountUsd} — fund it first`);
      }
      const cur: bigint = await token.allowance(s.address, vaultAddr);
      if (cur < need) {
        const tx = await token.approve(vaultAddr, need);
        await tx.wait();
      }
    }),
  );
  say("approve", `all ${opts.bids.length} financiers approved pUSD to the vault`);

  // ── the locks ──
  const results: StagedLock[] = [];

  async function submit(b: Bid): Promise<ethers.TransactionResponse> {
    const s = signers.get(b.label)!;
    return vault(s).lock(opts.collateralId, TRANCHE_ORDINAL[b.tranche], usd(b.amountUsd));
  }

  if (opts.contend) {
    // Group by tranche; rivals for one tranche go into the same block on purpose.
    const groups = new Map<TrancheName, Bid[]>();
    for (const b of opts.bids) groups.set(b.tranche, [...(groups.get(b.tranche) ?? []), b]);

    for (const [tranche, group] of groups) {
      if (group.length > 1) {
        say(
          "contend",
          `${group.map((g) => g.label).join(" vs ")} both bid ${tranche} — submitting concurrently ` +
            `so the block, not our ordering, decides`,
        );
      }
      const sent = await Promise.all(group.map(submit));
      const rcs = await Promise.all(sent.map((t) => t.wait()));
      rcs.forEach((rc, i) => {
        if (!rc || rc.status !== 1) throw new Error(`lock reverted: ${sent[i].hash}`);
      });
    }
  } else {
    for (const b of opts.bids) {
      const tx = await submit(b);
      const rc = await tx.wait();
      if (!rc || rc.status !== 1) throw new Error(`lock reverted: ${tx.hash}`);
    }
  }

  // ── read the locks back out of the vault's own logs, never from what we just sent ──
  const vaultRo = vault();
  const head = await obligor.provider!.getBlockNumber();
  const logs = await vaultRo.queryFilter(
    vaultRo.filters.Lock_(opts.collateralId),
    Math.max(0, head - 500),
    head,
  );
  const byAddr = new Map<string, string>();
  for (const [label, s] of signers) byAddr.set(s.address.toLowerCase(), label);

  for (const log of logs) {
    const ev = log as ethers.EventLog;
    if (Number(ev.args.raceNonce) !== raceNonce) continue;
    const addr = (ev.args.financier as string).toLowerCase();
    results.push({
      label: byAddr.get(addr) ?? addr,
      financier: ev.args.financier as string,
      tranche: (["SENIOR", "JUNIOR", "SUBORDINATE"] as TrancheName[])[Number(ev.args.tranche)],
      amountUsd: Number(ev.args.amount) / 1e6,
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      txIndex: ev.index,
      seq: Number(ev.args.seq),
    });
  }
  results.sort((a, b) => (a.blockNumber !== b.blockNumber ? a.blockNumber - b.blockNumber : a.txIndex - b.txIndex));

  say("locked", `${results.length} lock(s), in the order the SOURCE CHAIN put them:`);
  results.forEach((r, i) => {
    say(
      "locked",
      `  ${i + 1}. seq ${r.seq}  block ${r.blockNumber}  txIndex ${String(r.txIndex).padStart(3)}  ` +
        `${r.tranche.padEnd(11)} ${fmt(r.amountUsd).padStart(10)}  ${r.label}`,
    );
  });

  const blocks = new Map<number, number>();
  for (const r of results) blocks.set(r.blockNumber, (blocks.get(r.blockNumber) ?? 0) + 1);
  const tied = [...blocks.entries()].filter(([, n]) => n > 1);
  if (tied.length) {
    say(
      "tie-break",
      `${tied.map(([b, n]) => `block ${b} holds ${n} locks`).join("; ")} — block height alone CANNOT ` +
        `order these. calculateTxIndex at 0x0FD2 derives the index from the Merkle proof and resolves it.`,
    );
  } else {
    say("tie-break", `no same-block contention this run; ordering is decided by height alone`);
  }

  // ── close the race so it becomes provable ──
  const deadline = Number((await vaultRo.getCollateral(opts.collateralId)).raceDeadline) * 1000;
  const waitMs = deadline - Date.now();
  if (waitMs > 0) {
    say("close", `race window has ${Math.ceil(waitMs / 1000)}s left — waiting, then closing`);
    await new Promise((r) => setTimeout(r, waitMs + 3_000));
  }
  const closeTx = await vaultAsObligor.closeRace(opts.collateralId);
  await closeTx.wait();
  say("close", `race ${raceNonce} CLOSED · ${explorers.sepoliaTx(closeTx.hash)}`);
  say(
    "next",
    `attestation must now reach these blocks (minutes, not seconds). Then:\n` +
      `      bun run src/cli.ts prove ${opts.collateralId} ${results.map((r) => r.txHash).join(" ")}`,
  );

  return results;
}
