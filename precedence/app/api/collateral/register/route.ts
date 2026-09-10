import { getDeps } from "@/lib/precedence/config";
import { collateralDocumentHash, validateTerms } from "@precedence/sdk/domain/collateral";
import { addCollateral } from "@/lib/precedence/store/repositories";
import type { CollateralAsset, CollateralAssetType, Hex } from "@precedence/sdk/types";

/**
 * POST /api/collateral/register — record an asset a borrower has described.
 *
 * @remarks Two honest outcomes, never blurred:
 *
 * - `chain: true` — the caller already signed `registerCollateral` on Creditcoin CC3 themselves
 *   and passes the resulting `docHash` and transaction hash. The browser holds the key, so the
 *   write cannot happen here; this route only mirrors the result into the read store.
 * - `chain: false` — no live registry, so the asset is stored as a **simulation** with
 *   `source: "mock"`. It is labelled that way in the response and in the record, because an asset
 *   that exists only in our process must never look like one that exists on a chain.
 *
 * Validation runs on both paths and mirrors `CollateralRegistry.postFacilityTerms` exactly: caps
 * cannot exceed the haircut-derived advance, and rates must be ordinal. Duplicating those checks
 * client-side is a convenience; duplicating them here is what makes the simulated path behave
 * like the real one instead of accepting facilities the contract would reject.
 */

const ASSET_TYPES: CollateralAssetType[] = ["warehouse-receipt", "trade-receivable", "commodity-pledge"];

interface Body {
  assetType?: string;
  title?: string;
  obligor?: string;
  obligorAddress?: string;
  custodian?: string;
  custodianLocation?: string;
  docIdentifier?: string;
  faceValueUsd?: number;
  haircutPct?: number;
  termDays?: number;
  terms?: {
    seniorCapUsd?: number;
    juniorCapUsd?: number;
    subordinateCapUsd?: number;
    seniorRatePct?: number;
    juniorRatePct?: number;
    subordinateRatePct?: number;
  };
  /** Set only when the caller has already signed the on-chain registration. */
  onChain?: {
    docHash?: string;
    txHash?: string;
    registryAddress?: string;
    vaultAddress?: string;
    /** Both Creditcoin receipts, kept apart: registering the asset and posting its terms are two
     *  transactions, and collapsing them into one `txHash` meant the app could only ever link to
     *  the second. */
    registerTx?: string;
    termsTx?: string;
  };
}

export async function POST(req: Request) {
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return Response.json({ ok: false, error: "expected a JSON body" }, { status: 400 });
  }

  const problems: string[] = [];
  const need = (v: unknown, name: string) => {
    if (typeof v !== "string" || !v.trim()) problems.push(`${name} is required.`);
  };
  need(b.title, "Asset title");
  need(b.obligor, "Obligor name");
  need(b.custodian, "Custodian");
  need(b.docIdentifier, "Document identifier");
  if (!ASSET_TYPES.includes(b.assetType as CollateralAssetType)) {
    problems.push(`Asset type must be one of ${ASSET_TYPES.join(", ")}.`);
  }
  if (!b.obligorAddress || !/^0x[0-9a-fA-F]{40}$/.test(b.obligorAddress)) {
    problems.push("A connected wallet address is required — it is the obligor of record.");
  }
  const faceValueUsd = Number(b.faceValueUsd);
  const haircutPct = Number(b.haircutPct);
  const termDays = Number(b.termDays);
  if (!Number.isFinite(faceValueUsd) || faceValueUsd <= 0) problems.push("Face value must be above zero.");
  if (!Number.isFinite(haircutPct) || haircutPct < 0 || haircutPct > 100) {
    problems.push("Haircut must be between 0 and 100 percent.");
  }
  if (!Number.isFinite(termDays) || termDays < 1) problems.push("Term must be at least one day.");

  if (problems.length) return Response.json({ ok: false, problems }, { status: 400 });

  const t = b.terms ?? {};
  const terms = {
    seniorCapUsd: Number(t.seniorCapUsd ?? 0),
    juniorCapUsd: Number(t.juniorCapUsd ?? 0),
    subordinateCapUsd: Number(t.subordinateCapUsd ?? 0),
    seniorRatePct: Number(t.seniorRatePct ?? 0),
    juniorRatePct: Number(t.juniorRatePct ?? 0),
    subordinateRatePct: Number(t.subordinateRatePct ?? 0),
  };

  const advanceRatePct = 100 - haircutPct;
  const draft = { faceValueUsd, haircutPct, advanceRatePct } as CollateralAsset;

  const check = validateTerms(draft, terms);
  if (!check.ok) return Response.json({ ok: false, problems: check.problems }, { status: 400 });

  const deps = getDeps();
  const chain = Boolean(b.onChain?.txHash && b.onChain?.docHash);

  // Derived the same way on both paths, so a simulated registration and a real one identify the
  // same document.
  const docHash = (b.onChain?.docHash ??
    collateralDocumentHash({
      assetType: b.assetType as string,
      docIdentifier: b.docIdentifier as string,
      custodian: b.custodian as string,
      obligor: b.obligor as string,
      faceValueUsd,
    })) as Hex;

  const facility = terms.seniorCapUsd + terms.juniorCapUsd + terms.subordinateCapUsd;
  const now = new Date().toISOString();

  const asset: CollateralAsset = {
    id: `col-${docHash.slice(2, 10)}`,
    assetType: b.assetType as CollateralAssetType,
    title: (b.title as string).trim(),
    symbol: (b.docIdentifier as string).trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-").slice(0, 20),
    obligor: (b.obligor as string).trim(),
    obligorAddress: b.obligorAddress as Hex,
    custodian: (b.custodian as string).trim(),
    custodianLocation: (b.custodianLocation ?? "").trim(),
    faceValueUsd,
    financingRequestedUsd: facility,
    haircutPct,
    advanceRatePct,
    termDays,
    // Blended coupon across the posted tranches, weighted by cap. Not a rate anyone is charged —
    // it is what the facility costs in aggregate if fully drawn.
    currentRatePct:
      facility > 0
        ? Math.round(
            ((terms.seniorCapUsd * terms.seniorRatePct +
              terms.juniorCapUsd * terms.juniorRatePct +
              terms.subordinateCapUsd * terms.subordinateRatePct) /
              facility) *
              100,
          ) / 100
        : 0,
    targetRatePct: terms.seniorRatePct,
    terms: { ...terms, termDays, postedAt: now },
    docHash,
    nftTokenId: docHash.slice(2, 10),
    registryAddress: (b.onChain?.registryAddress ?? "0x0000000000000000000000000000000000000000") as Hex,
    vaultAddress: (b.onChain?.vaultAddress ?? "0x0000000000000000000000000000000000000000") as Hex,
    status: "CLEAR",
    // Risk is NOT taken from a model. A larger haircut means the lender is better protected, so
    // it is the one input here that bears on risk without anybody's opinion.
    riskLabel: haircutPct >= 20 ? "Low" : haircutPct >= 12 ? "Medium" : "High",
    riskScore: Math.max(0.05, Math.min(0.95, 1 - haircutPct / 40)),
    // Clear title means "no prior lien in THIS registry", which is all we can ever check. A
    // brand-new registration has none by construction.
    verifiedClearTitle: true,
    fetchedAt: now,
    source: chain ? "creditcoin-registry" : "mock",
    // Only on the signed path, so this can never become a fabricated explorer link. A simulated
    // registration signs nothing and therefore has nothing to point at.
    onChainRefs: chain
      ? {
          creditcoinRegisterTx: (b.onChain?.registerTx ?? undefined) as Hex | undefined,
          creditcoinTermsTx: (b.onChain?.termsTx ?? b.onChain?.txHash ?? undefined) as Hex | undefined,
        }
      : undefined,
  };

  try {
    await addCollateral(asset);
  } catch (e) {
    return Response.json({ ok: false, problems: [(e as Error).message] }, { status: 409 });
  }

  return Response.json({
    ok: true,
    collateral: asset,
    chain,
    txHash: b.onChain?.txHash ?? null,
    // The old message read "no live registry is connected (live at 0x1E67…)" — it interpolated
    // the adapter note into a sentence that contradicted it. Whether a registry is DEPLOYED and
    // whether the caller SIGNED are different facts, and the message has to keep them apart.
    note: chain
      ? "Registered on Creditcoin CC3 and mirrored into the read store."
      : deps.creditcoin.isLive()
        ? "Stored locally only — the registry is deployed and live, but this registration was not " +
          "signed, so nothing was written to a chain. Connect a wallet and register again to put " +
          "it on Creditcoin."
        : `Stored locally only — no registry is connected (${deps.modeNotes.creditcoin}). ` +
          `Nothing was written to a chain.`,
  });
}
