/**
 * The permissionless keeper.
 *
 * @dev This process is a CONVENIENCE, not a dependency. Every function it calls is callable by
 * anyone and gated only on a block timestamp or an absent proof, so if this worker is dead the
 * protocol still protects lenders — someone else pokes it and collects the bounty instead. That
 * distinction is the whole reason the failure branch is built this way, and it is the honest answer
 * to "what happens when your monitor goes down?"
 *
 * The keeper key holds NO privileges. It is not the deployer, not a state writer, not a minter.
 * That is checkable on-chain, which is why it was generated separately.
 */
import { ethers } from "ethers";
import { engine, explorers, keeperSigner, registry } from "./config";

/** Mirrors `PrecedenceTypes.EncumbranceState`. */
export const STATES = [
  "CLEAR",
  "RACE_OPEN",
  "PRIORITY_SETTLED",
  "ENCUMBERED",
  "FROZEN",
  "GRACE",
  "DUTCH_LIQUIDATION",
  "REPAID",
  "DEFAULTED",
  "BREACHED",
] as const;

/** Which poke is next for a facility in each state, if any. */
const NEXT_POKE: Partial<Record<(typeof STATES)[number], string>> = {
  PRIORITY_SETTLED: "pokeFreezeDraw",
  ENCUMBERED: "pokeFreezeDraw",
  FROZEN: "pokePcrStabilization",
  GRACE: "pokeDutchLiquidation",
  DUTCH_LIQUIDATION: "pokeTerminateDefault",
  BREACHED: "pokeDutchLiquidation",
};

export interface FacilityStatus {
  collateralId: string;
  state: (typeof STATES)[number];
  activeLiens: number;
  principal: string;
  pcrBps: number;
  nextPoke?: string;
  /** Whether that poke's gate is currently open. Determined by TRYING it, not by guessing. */
  pokeReady?: boolean;
  pokeBlockedBy?: string;
}

const usd = (v: bigint) => `$${(Number(v) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export async function facilityStatus(collateralId: string): Promise<FacilityStatus> {
  const engineC = engine();
  const registryC = registry();

  const [enc, facility, pcr] = await Promise.all([
    registryC.getEncumbrance(collateralId),
    engineC.facility(collateralId),
    engineC.pcrBps(collateralId).catch(() => 0n),
  ]);

  const state = STATES[Number(enc[0])];
  const status: FacilityStatus = {
    collateralId,
    state,
    activeLiens: Number(enc[1]),
    principal: usd(facility.principal ?? 0n),
    // Unbounded when there is no principal; report it as such rather than as a huge number.
    pcrBps: pcr > 10n ** 12n ? Number.POSITIVE_INFINITY : Number(pcr),
  };

  const next = NEXT_POKE[state];
  if (next) {
    status.nextPoke = next;
    // Ask the chain whether the gate is open by simulating the call. Reimplementing the timestamp
    // logic here would just be a second place for it to be wrong.
    try {
      await engineC.getFunction(next).staticCall(collateralId, { from: keeperSigner().address });
      status.pokeReady = true;
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? String(e);
      status.pokeReady = false;
      status.pokeBlockedBy = msg.slice(0, 140);
    }
  }
  return status;
}

export interface PokeResult {
  fn: string;
  txHash: string;
  explorerUrl: string;
  gasUsed: bigint;
  bountyPaidCtc: string;
  newState: string;
}

/**
 * Call the next available poke for a facility.
 * @dev Returns null when no gate is open — that is the normal case for a healthy facility, not an
 * error, so it is not thrown.
 */
export async function pokeNext(collateralId: string): Promise<PokeResult | null> {
  const signer = keeperSigner();
  const engineC = engine(signer);

  const status = await facilityStatus(collateralId);
  if (!status.nextPoke || !status.pokeReady) return null;

  const before = await signer.provider!.getBalance(signer.address);
  const tx = await engineC.getFunction(status.nextPoke)(collateralId);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`${status.nextPoke} reverted: ${tx.hash}`);

  const after = await signer.provider!.getBalance(signer.address);
  // Be explicit: the contract call is loosely typed, so coerce rather than rely on inference.
  const gasCost = BigInt(receipt.gasUsed ?? 0) * BigInt(receipt.gasPrice ?? 0);
  // What the keeper actually earned: balance delta plus the gas it burned getting there.
  const net = after - before + gasCost;

  const post = await facilityStatus(collateralId);
  return {
    fn: status.nextPoke,
    txHash: tx.hash,
    explorerUrl: explorers.cc3Tx(tx.hash),
    gasUsed: receipt.gasUsed,
    bountyPaidCtc: ethers.formatEther(net > 0n ? net : 0n),
    newState: post.state,
  };
}

/**
 * Walk a facility all the way through the unwind, poking whatever is currently open.
 *
 * @dev Used by the demo to trigger the failure act on command. In production nothing calls this —
 * independent keepers each poke whatever they find open, for the bounty.
 */
export async function driveUnwind(
  collateralId: string,
  opts: { maxPokes?: number; onPoke?: (r: PokeResult) => void } = {},
): Promise<PokeResult[]> {
  const done: PokeResult[] = [];
  const max = opts.maxPokes ?? 8;

  for (let i = 0; i < max; i++) {
    const r = await pokeNext(collateralId);
    if (!r) break;
    done.push(r);
    opts.onPoke?.(r);
    if (r.newState === "DEFAULTED" || r.newState === "REPAID") break;
  }
  return done;
}

/** Poll a set of facilities and poke anything whose gate has opened. */
export async function runKeeperLoop(
  collateralIds: string[],
  opts: { intervalMs?: number; onEvent?: (msg: string) => void } = {},
): Promise<void> {
  const say = opts.onEvent ?? ((m: string) => console.log(m));
  const interval = opts.intervalMs ?? 60_000;
  const signer = keeperSigner();

  say(`keeper ${signer.address} watching ${collateralIds.length} facilities every ${interval / 1000}s`);
  say(`this address holds NO privileges — if this process dies, anyone else can poke instead`);

  for (;;) {
    for (const id of collateralIds) {
      try {
        const s = await facilityStatus(id);
        if (s.nextPoke && s.pokeReady) {
          const r = await pokeNext(id);
          if (r) {
            say(
              `POKED ${r.fn} on ${id.slice(0, 12)}… → ${r.newState} · ${r.gasUsed} gas · ` +
                `bounty ${r.bountyPaidCtc} CTC · ${r.explorerUrl}`,
            );
          }
        } else {
          say(`${id.slice(0, 12)}… ${s.state} · liens ${s.activeLiens} · ${s.nextPoke ? `${s.nextPoke} blocked: ${s.pokeBlockedBy}` : "no poke applicable"}`);
        }
      } catch (e) {
        say(`error on ${id.slice(0, 12)}…: ${(e as Error).message.slice(0, 160)}`);
      }
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
