/**
 * Real Sepolia client — talks to the deployed `PriorityVault` and `PUSD`.
 *
 * Satisfies exactly the same `SepoliaClient` interface as the mock, which is the whole point of the
 * `mock | chain` design: swapping this in changes no orchestrator or component code.
 *
 * @remarks
 * `isLive()` returns true here and false in the mock, and the UI's honesty chip reads THAT rather
 * than an env var. So a misconfigured environment can produce a degraded demo but never a
 * dishonest one — simulated data cannot render as on-chain.
 *
 * Uses viem to match the rest of the app. The worker uses ethers because `@gluwa/usc-sdk` requires
 * it; that split is deliberate and confined to the worker.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Address,
  type Hex as ViemHex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { Hex, SourceLockRecord, Tranche } from "../../types";
import type { LockParams, RefundParams, RepayParams, SepoliaClient, TxRef } from "./sepolia-client";
import { PriorityVault_ABI, PUSD_ABI } from "../generated/abis";

const TRANCHE_INDEX: Record<Tranche, number> = { SENIOR: 0, JUNIOR: 1, SUBORDINATE: 2 };
const TRANCHE_NAME: Tranche[] = ["SENIOR", "JUNIOR", "SUBORDINATE"];

/** pUSD has 6 decimals, so `$5,000` is `5000000000`. */
const PUSD_DECIMALS = 6;
const toUnits = (usd: number): bigint => parseUnits(usd.toFixed(PUSD_DECIMALS), PUSD_DECIMALS);
const fromUnits = (v: bigint): number => Number(v) / 10 ** PUSD_DECIMALS;

export interface ChainSepoliaConfig {
  rpcUrl: string;
  vaultAddress: Address;
  pusdAddress: Address;
  /** Per-role private keys, so each financier signs its own lock. */
  keys: Partial<Record<"obligor" | "meridian" | "vector" | "novum" | "refinancer", Hex>>;
}

export class ChainSepoliaClient implements SepoliaClient {
  private readonly publicClient: PublicClient;
  private readonly cfg: ChainSepoliaConfig;

  constructor(cfg: ChainSepoliaConfig) {
    this.cfg = cfg;
    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(cfg.rpcUrl),
    });
  }

  isLive(): boolean {
    return true;
  }

  vaultAddress(): Hex {
    return this.cfg.vaultAddress;
  }

  settlementToken(): Hex {
    return this.cfg.pusdAddress;
  }

  async blockNumber(): Promise<number> {
    return Number(await this.publicClient.getBlockNumber());
  }

  /**
   * Wallet for a named role.
   * @throws with the exact env var name, rather than a null-signer error deep in a write.
   */
  private wallet(role: keyof ChainSepoliaConfig["keys"]): { client: WalletClient; account: Address } {
    const pk = this.cfg.keys[role];
    if (!pk) {
      const envName = role === "obligor" ? "OBLIGOR_PK" : `FIN_${role.toUpperCase()}_PK`;
      throw new Error(`No Sepolia key configured for "${role}". Set ${envName} in .env.local.`);
    }
    const account = privateKeyToAccount(pk as ViemHex);
    return {
      client: createWalletClient({ account, chain: sepolia, transport: http(this.cfg.rpcUrl) }),
      account: account.address,
    };
  }

  /** Map an agent id onto a funded role key. */
  private roleFor(financier: string): keyof ChainSepoliaConfig["keys"] {
    const id = financier.toLowerCase();
    if (id === "meridian" || id === "vector" || id === "novum" || id === "refinancer") return id;
    throw new Error(`Unknown financier "${financier}" — no funded Sepolia key for it.`);
  }

  private async waitFor(hash: ViemHex): Promise<TxRef> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`Sepolia transaction reverted: ${hash}`);
    }
    return {
      tx: hash as Hex,
      blockNumber: Number(receipt.blockNumber),
      // The canonical intra-block position. The precompile re-derives this from the Merkle path;
      // carrying it here lets the UI cross-check the two.
      txIndex: receipt.transactionIndex,
    };
  }

  /**
   * Open a race, resetting the vault's per-collateral lock counter.
   *
   * @remarks Only the registered obligor may do this, and the counter reset is what makes the
   * gate's "seq contiguous from 1" completeness check enforceable across repeat financings.
   */
  async openRace(
    collateralId: string,
    facilityUsd: number,
    caps: [number, number, number],
  ): Promise<TxRef> {
    const { client, account } = this.wallet("obligor");
    const sum = caps[0] + caps[1] + caps[2];
    if (sum !== facilityUsd) {
      throw new Error(
        `tranche caps sum to ${sum} but the facility is ${facilityUsd}; the vault requires them to ` +
          `match so its allocation is unambiguous`,
      );
    }
    const hash = await client.writeContract({
      address: this.cfg.vaultAddress,
      abi: PriorityVault_ABI,
      functionName: "openRace",
      args: [
        collateralId as ViemHex,
        toUnits(facilityUsd),
        caps.map(toUnits) as unknown as readonly [bigint, bigint, bigint],
        600n, // 10-minute window
      ],
      account,
      chain: sepolia,
    });
    return this.waitFor(hash);
  }

  async lock(params: LockParams): Promise<TxRef & { lock: SourceLockRecord }> {
    const role = this.roleFor(params.financier);
    const { client, account } = this.wallet(role);
    const amount = toUnits(params.amountUsd);

    // Approve exactly what this lock needs. An unlimited approval on a demo key is a habit worth
    // not forming, and the extra transaction costs a fraction of a cent.
    const approveHash = await client.writeContract({
      address: this.cfg.pusdAddress,
      abi: PUSD_ABI,
      functionName: "approve",
      args: [this.cfg.vaultAddress, amount],
      account,
      chain: sepolia,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: approveHash });

    const hash = await client.writeContract({
      address: this.cfg.vaultAddress,
      abi: PriorityVault_ABI,
      functionName: "lock",
      args: [params.collateralId as ViemHex, TRANCHE_INDEX[params.tranche], amount],
      account,
      chain: sepolia,
    });
    const ref = await this.waitFor(hash);

    // Read the lock back from the chain rather than assuming what we wrote. `seq` in particular is
    // assigned by the contract, and the gate requires it to be correct.
    const count = (await this.publicClient.readContract({
      address: this.cfg.vaultAddress,
      abi: PriorityVault_ABI,
      functionName: "lockCountOf",
      args: [params.collateralId as ViemHex],
    })) as bigint;

    const onChain = (await this.publicClient.readContract({
      address: this.cfg.vaultAddress,
      abi: PriorityVault_ABI,
      functionName: "lockAt",
      args: [params.collateralId as ViemHex, count - 1n],
    })) as {
      financier: Address;
      tranche: number;
      amount: bigint;
      seq: bigint;
      blockNumber: bigint;
    };

    const lock: SourceLockRecord = {
      collateralId: params.collateralId,
      financier: params.financier,
      financierAddress: onChain.financier,
      tranche: TRANCHE_NAME[Number(onChain.tranche)] ?? params.tranche,
      amountUsd: fromUnits(onChain.amount),
      lockBlockNumber: ref.blockNumber,
      lockTxIndex: ref.txIndex,
      seq: Number(onChain.seq),
      token: this.cfg.pusdAddress,
      sepoliaTxHash: ref.tx,
      receiptStatus: 1,
      emittedBy: this.cfg.vaultAddress,
      timestamp: new Date().toISOString(),
      refunded: false,
    };

    return { ...ref, lock };
  }

  async draw(collateralId: string, _obligor: string, amountUsd: number): Promise<TxRef> {
    const { client, account } = this.wallet("obligor");
    const hash = await client.writeContract({
      address: this.cfg.vaultAddress,
      abi: PriorityVault_ABI,
      functionName: "draw",
      args: [collateralId as ViemHex, toUnits(amountUsd)],
      account,
      chain: sepolia,
    });
    return this.waitFor(hash);
  }

  async repay(params: RepayParams): Promise<TxRef> {
    const { client, account } = this.wallet("obligor");
    const amount = toUnits(params.amountUsd);

    const approveHash = await client.writeContract({
      address: this.cfg.pusdAddress,
      abi: PUSD_ABI,
      functionName: "approve",
      args: [this.cfg.vaultAddress, amount],
      account,
      chain: sepolia,
    });
    await this.publicClient.waitForTransactionReceipt({ hash: approveHash });

    const hash = await client.writeContract({
      address: this.cfg.vaultAddress,
      abi: PriorityVault_ABI,
      functionName: "repay",
      args: [params.collateralId as ViemHex, amount],
      account,
      chain: sepolia,
    });
    return this.waitFor(hash);
  }

  async refund(params: RefundParams): Promise<TxRef> {
    const role = this.roleFor(params.financier);
    const { client, account } = this.wallet(role);
    const hash = await client.writeContract({
      address: this.cfg.vaultAddress,
      abi: PriorityVault_ABI,
      functionName: "refund",
      args: [params.collateralId as ViemHex, BigInt(params.lockIndex)],
      account,
      chain: sepolia,
    });
    return this.waitFor(hash);
  }

  /** Read every lock for the collateral's CURRENT race, straight from vault storage. */
  async getLocks(collateralId: string): Promise<SourceLockRecord[]> {
    const count = (await this.publicClient.readContract({
      address: this.cfg.vaultAddress,
      abi: PriorityVault_ABI,
      functionName: "lockCountOf",
      args: [collateralId as ViemHex],
    })) as bigint;

    const out: SourceLockRecord[] = [];
    for (let i = 0n; i < count; i++) {
      const l = (await this.publicClient.readContract({
        address: this.cfg.vaultAddress,
        abi: PriorityVault_ABI,
        functionName: "lockAt",
        args: [collateralId as ViemHex, i],
      })) as {
        financier: Address;
        tranche: number;
        amount: bigint;
        refunded: bigint;
        seq: bigint;
        blockNumber: bigint;
      };

      out.push({
        collateralId,
        financier: l.financier,
        financierAddress: l.financier,
        tranche: TRANCHE_NAME[Number(l.tranche)],
        amountUsd: fromUnits(l.amount),
        lockBlockNumber: Number(l.blockNumber),
        // Not recoverable from storage — the vault does not record it, and the authoritative
        // source is the precompile's `calculateTxIndex`. The worker fills it in when proving.
        lockTxIndex: -1,
        seq: Number(l.seq),
        token: this.cfg.pusdAddress,
        sepoliaTxHash: "0x" as Hex,
        receiptStatus: 1,
        emittedBy: this.cfg.vaultAddress,
        timestamp: new Date().toISOString(),
        refunded: l.refunded > 0n,
      });
    }
    return out;
  }
}
