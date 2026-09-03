"use client";

/**
 * Register collateral on Creditcoin CC3 from the browser.
 *
 * @remarks This is why the app spans two chains, and why that is not an accident to be designed
 * away. Attestcoin's readability precompile proves a transaction happened on a DIFFERENT chain, so
 * capital has to lock somewhere foreign — Sepolia — for there to be anything worth proving. The
 * lien registry itself lives next to the precompile, on Creditcoin.
 *
 * What WAS an accident was making the user perform the switch. `writeContract` carries `chainId`,
 * so wagmi asks the wallet to move to CC3 as part of signing, and adds the chain if the wallet has
 * never seen it. The user presses "Register collateral" and approves; they never look for a button.
 */
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { CollateralRegistry_ABI } from "@/lib/precedence/adapters/generated/abis";
import { creditcoinCc3 } from "./chains";
import { wagmiConfig } from "./wagmi";

const CC3 = creditcoinCc3.id;
const D = 1_000_000n;
const usd6 = (n: number) => BigInt(Math.round(n * 1e6));

export const ASSET_TYPE_ORDINAL = {
  "warehouse-receipt": 0,
  "trade-receivable": 1,
  "commodity-pledge": 2,
} as const;

export type AssetTypeKey = keyof typeof ASSET_TYPE_ORDINAL;

export interface RegisterOnChainArgs {
  registry: Address;
  vault: Address;
  assetType: AssetTypeKey;
  docIdentifier: string;
  obligorName: string;
  custodian: string;
  faceValueUsd: number;
  haircutPct: number;
  termDays: number;
  metadataURI: string;
  terms: {
    seniorCapUsd: number;
    juniorCapUsd: number;
    subordinateCapUsd: number;
    seniorRatePct: number;
    juniorRatePct: number;
    subordinateRatePct: number;
  };
}

/**
 * The document id the contract keys everything on.
 *
 * @remarks Derived from the document's own identifying fields, so registering the same receipt
 * twice produces the same id and the second attempt is refused on-chain. That refusal is the
 * feature: two registrations of one document is precisely what this protocol makes detectable.
 */
export function docHashFor(a: Pick<RegisterOnChainArgs, "assetType" | "docIdentifier" | "custodian" | "obligorName" | "faceValueUsd">): Hex {
  return keccak256(
    stringToHex(
      [a.assetType, a.docIdentifier.trim(), a.custodian.trim(), a.obligorName.trim(), Math.round(a.faceValueUsd)]
        .join("|")
        .toLowerCase(),
    ),
  );
}

export type RegisterStage = "registering" | "posting-terms" | "done";

/**
 * Two transactions: register, then post the terms.
 *
 * @remarks Deliberately not batched. `postFacilityTerms` is `onlyObligor` and only legal once the
 * collateral exists, so they cannot be one call — and keeping them separate means a borrower who
 * registers but mistypes a cap can re-post terms without re-registering the document.
 */
export async function registerCollateralOnChain(
  a: RegisterOnChainArgs,
  onStage: (s: RegisterStage, txHash?: Hex) => void,
): Promise<{ docHash: Hex; registerTx: Hex; termsTx: Hex }> {
  const docHash = docHashFor(a);

  const already = (await readContract(wagmiConfig, {
    chainId: CC3,
    address: a.registry,
    abi: CollateralRegistry_ABI,
    functionName: "exists",
    args: [docHash],
  }).catch(() => false)) as boolean;
  if (already) {
    throw new Error(
      "This exact document is already registered on Creditcoin. Registering one document twice is " +
        "what this registry exists to prevent, so the contract refuses it.",
    );
  }

  onStage("registering");
  const registerTx = await writeContract(wagmiConfig, {
    chainId: CC3,
    address: a.registry,
    abi: CollateralRegistry_ABI,
    functionName: "registerCollateral",
    args: [
      docHash,
      ASSET_TYPE_ORDINAL[a.assetType],
      usd6(a.faceValueUsd),
      Math.round(a.haircutPct * 100),
      Math.round(a.termDays),
      a.vault,
      a.vault,
      a.metadataURI,
    ],
  });
  const r1 = await waitForTransactionReceipt(wagmiConfig, { chainId: CC3, hash: registerTx });
  if (r1.status !== "success") throw new Error(`registerCollateral reverted: ${registerTx}`);

  onStage("posting-terms", registerTx);
  const termsTx = await writeContract(wagmiConfig, {
    chainId: CC3,
    address: a.registry,
    abi: CollateralRegistry_ABI,
    functionName: "postFacilityTerms",
    args: [
      docHash,
      usd6(a.terms.seniorCapUsd),
      usd6(a.terms.juniorCapUsd),
      usd6(a.terms.subordinateCapUsd),
      Math.round(a.terms.seniorRatePct * 100),
      Math.round(a.terms.juniorRatePct * 100),
      Math.round(a.terms.subordinateRatePct * 100),
    ],
  });
  const r2 = await waitForTransactionReceipt(wagmiConfig, { chainId: CC3, hash: termsTx });
  if (r2.status !== "success") throw new Error(`postFacilityTerms reverted: ${termsTx}`);

  onStage("done", termsTx);
  return { docHash, registerTx, termsTx };
}

export const registryUnits = { usd6, D };
