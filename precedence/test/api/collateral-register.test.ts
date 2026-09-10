/**
 * `POST /api/collateral/register` — recording an asset a borrower has described.
 *
 * @remarks The largest validation surface in the app, and the one place where a mistake is
 * expensive in two different directions. Too lax and the simulated path accepts facilities the
 * contract would reject on a revert, so the demo diverges from the chain. Too loose about
 * provenance and a locally-stored asset comes back looking like one that exists on Creditcoin,
 * which is the exact claim this project is not allowed to make.
 *
 * So the tests come in three groups: the field validation, the derived fields (a document hash
 * that must be identical on both paths, or a simulated registration and a real one identify
 * different documents), and the honesty of the `chain` / `source` / `onChainRefs` triple.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { deps, resetFakes } from "../helpers/fakes";
import { freshStore } from "../helpers/fixtures";
import { get, json, post, postRaw } from "../helpers/http";

const route = () => import("@/app/api/collateral/register/route");

const WALLET = "0x" + "9".repeat(40);
const DOC_HASH = "0x" + "7f".repeat(32);
const TX = "0x" + "3c".repeat(32);

/** A body that passes every check, so a test can break exactly one thing. */
function good(over: Record<string, unknown> = {}) {
  return {
    assetType: "warehouse-receipt",
    title: "Antwerp Copper Cathode Receipt",
    obligor: "Northwind Metals Ltd",
    obligorAddress: WALLET,
    custodian: "Antwerp Bonded Storage",
    custodianLocation: "Antwerp, Belgium",
    docIdentifier: "WR-2026-441",
    faceValueUsd: 100_000,
    haircutPct: 15,
    termDays: 90,
    terms: {
      seniorCapUsd: 50_000,
      juniorCapUsd: 25_000,
      subordinateCapUsd: 10_000,
      seniorRatePct: 5,
      juniorRatePct: 10,
      subordinateRatePct: 18,
    },
    ...over,
  };
}

interface Ok {
  ok: boolean;
  chain: boolean;
  txHash: string | null;
  note: string;
  collateral: {
    id: string;
    symbol: string;
    assetType: string;
    title: string;
    obligor: string;
    obligorAddress: string;
    custodian: string;
    custodianLocation: string;
    docHash: string;
    nftTokenId: string;
    faceValueUsd: number;
    financingRequestedUsd: number;
    termDays: number;
    haircutPct: number;
    advanceRatePct: number;
    currentRatePct: number;
    targetRatePct: number;
    riskLabel: string;
    riskScore: number;
    status: string;
    source: string;
    verifiedClearTitle: boolean;
    registryAddress: string;
    vaultAddress: string;
    onChainRefs?: { creditcoinRegisterTx?: string; creditcoinTermsTx?: string };
    terms: Record<string, number | string>;
  };
}

interface Bad {
  ok: boolean;
  problems?: string[];
  error?: string;
}

async function register(body: unknown) {
  const { POST } = await route();
  return json<Ok & Bad>(await POST(post("/api/collateral/register", body)));
}

describe("POST /api/collateral/register", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  describe("the body itself", () => {
    test("rejects a body that is not JSON", async () => {
      const { POST } = await route();
      const { status, body } = await json<Bad>(
        await POST(postRaw("/api/collateral/register", "not json at all")),
      );
      expect(status).toBe(400);
      expect(body.error).toBe("expected a JSON body");
    });

    test("rejects an empty body with the fields it needs", async () => {
      const { status, body } = await register({});
      expect(status).toBe(400);
      expect(body.problems?.length).toBeGreaterThan(3);
    });

    test("rejects a JSON array", async () => {
      const { status } = await register([]);
      expect(status).toBe(400);
    });

    test("reports every problem at once rather than one at a time", async () => {
      const { body } = await register({ faceValueUsd: -1, haircutPct: 200, termDays: 0 });
      // Four missing strings, a bad asset type, a missing wallet, and three bad numbers.
      expect(body.problems?.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe("required text fields", () => {
    for (const [field, label] of [
      ["title", "Asset title"],
      ["obligor", "Obligor name"],
      ["custodian", "Custodian"],
      ["docIdentifier", "Document identifier"],
    ] as const) {
      test(`rejects a missing ${field}`, async () => {
        const { status, body } = await register(good({ [field]: undefined }));
        expect(status).toBe(400);
        expect(body.problems).toContain(`${label} is required.`);
      });

      test(`rejects a blank ${field}`, async () => {
        const { body } = await register(good({ [field]: "   " }));
        expect(body.problems).toContain(`${label} is required.`);
      });

      test(`rejects a non-string ${field}`, async () => {
        const { body } = await register(good({ [field]: 42 }));
        expect(body.problems).toContain(`${label} is required.`);
      });
    }

    test("trims the title it stores", async () => {
      const { body } = await register(good({ title: "  Spaced Title  " }));
      expect(body.collateral.title).toBe("Spaced Title");
    });

    test("trims the obligor and custodian", async () => {
      const { body } = await register(good({ obligor: " North ", custodian: " Antwerp " }));
      expect(body.collateral.obligor).toBe("North");
      expect(body.collateral.custodian).toBe("Antwerp");
    });

    test("defaults a missing custodian location to empty rather than rejecting", async () => {
      const { status, body } = await register(good({ custodianLocation: undefined }));
      expect(status).toBe(200);
      expect(body.collateral.custodianLocation).toBe("");
    });
  });

  describe("asset type", () => {
    for (const t of ["warehouse-receipt", "trade-receivable", "commodity-pledge"]) {
      test(`accepts ${t}`, async () => {
        const { status, body } = await register(good({ assetType: t }));
        expect(status).toBe(200);
        expect(body.collateral.assetType).toBe(t);
      });
    }

    test("rejects an unknown asset type", async () => {
      const { status, body } = await register(good({ assetType: "spaceship" }));
      expect(status).toBe(400);
      expect(body.problems?.join(" ")).toContain("Asset type must be one of");
    });

    test("rejects a missing asset type", async () => {
      const { body } = await register(good({ assetType: undefined }));
      expect(body.problems?.join(" ")).toContain("Asset type must be one of");
    });

    test("names all three permitted types in the message", async () => {
      const { body } = await register(good({ assetType: "x" }));
      const msg = body.problems?.join(" ") ?? "";
      expect(msg).toContain("warehouse-receipt");
      expect(msg).toContain("trade-receivable");
      expect(msg).toContain("commodity-pledge");
    });
  });

  describe("the obligor wallet, which is the obligor of record", () => {
    test("rejects a missing address", async () => {
      const { body } = await register(good({ obligorAddress: undefined }));
      expect(body.problems?.join(" ")).toContain("connected wallet address is required");
    });

    test("rejects an address that is too short", async () => {
      const { body } = await register(good({ obligorAddress: "0x1234" }));
      expect(body.problems?.join(" ")).toContain("connected wallet address is required");
    });

    test("rejects an address that is too long", async () => {
      const { body } = await register(good({ obligorAddress: "0x" + "9".repeat(41) }));
      expect(body.problems?.join(" ")).toContain("connected wallet address is required");
    });

    test("rejects an address with no 0x prefix", async () => {
      const { body } = await register(good({ obligorAddress: "9".repeat(40) }));
      expect(body.problems?.join(" ")).toContain("connected wallet address is required");
    });

    test("rejects an address with a non-hex character", async () => {
      const { body } = await register(good({ obligorAddress: "0x" + "z".repeat(40) }));
      expect(body.problems?.join(" ")).toContain("connected wallet address is required");
    });

    test("rejects a placeholder SAMPLE address", async () => {
      const { body } = await register(good({ obligorAddress: "0xSAMPLE_OBLIGOR_1234" }));
      expect(body.problems?.join(" ")).toContain("connected wallet address is required");
    });

    test("accepts a mixed-case checksummed address", async () => {
      const mixed = "0xAbC0000000000000000000000000000000000dEf";
      const { status, body } = await register(good({ obligorAddress: mixed }));
      expect(status).toBe(200);
      expect(body.collateral.obligorAddress).toBe(mixed);
    });
  });

  describe("the numbers", () => {
    test("rejects a face value of zero", async () => {
      const { body } = await register(good({ faceValueUsd: 0 }));
      expect(body.problems).toContain("Face value must be above zero.");
    });

    test("rejects a negative face value", async () => {
      const { body } = await register(good({ faceValueUsd: -5 }));
      expect(body.problems).toContain("Face value must be above zero.");
    });

    test("rejects a non-numeric face value", async () => {
      const { body } = await register(good({ faceValueUsd: "lots" }));
      expect(body.problems).toContain("Face value must be above zero.");
    });

    test("accepts a numeric string face value, because a form sends strings", async () => {
      const { status, body } = await register(good({ faceValueUsd: "100000" }));
      expect(status).toBe(200);
      expect(body.collateral.faceValueUsd).toBe(100_000);
    });

    test("rejects a negative haircut", async () => {
      const { body } = await register(good({ haircutPct: -1 }));
      expect(body.problems).toContain("Haircut must be between 0 and 100 percent.");
    });

    test("rejects a haircut above 100", async () => {
      const { body } = await register(good({ haircutPct: 101 }));
      expect(body.problems).toContain("Haircut must be between 0 and 100 percent.");
    });

    test("accepts a zero haircut", async () => {
      const { status } = await register(good({ haircutPct: 0 }));
      expect(status).toBe(200);
    });

    test("accepts a haircut of exactly 100, which leaves no advance", async () => {
      // Boundary check only: the terms then have to be zero, and zero caps are rejected below.
      const { body } = await register(good({ haircutPct: 100 }));
      expect(body.problems?.join(" ") ?? "").not.toContain("Haircut must be between");
    });

    test("rejects a term of zero days", async () => {
      const { body } = await register(good({ termDays: 0 }));
      expect(body.problems).toContain("Term must be at least one day.");
    });

    test("rejects a fractional term below one day", async () => {
      const { body } = await register(good({ termDays: 0.5 }));
      expect(body.problems).toContain("Term must be at least one day.");
    });

    test("accepts a one-day term", async () => {
      const { status } = await register(good({ termDays: 1 }));
      expect(status).toBe(200);
    });

    test("stores the term on the facility", async () => {
      const { body } = await register(good({ termDays: 180 }));
      expect(body.collateral.termDays ?? body.collateral.terms.termDays).toBe(180);
    });
  });

  describe("the tranche terms, mirroring the contract", () => {
    test("rejects a facility of zero", async () => {
      const { status, body } = await register(
        good({ terms: { seniorCapUsd: 0, juniorCapUsd: 0, subordinateCapUsd: 0, seniorRatePct: 5, juniorRatePct: 10, subordinateRatePct: 18 } }),
      );
      expect(status).toBe(400);
      expect(body.problems).toContain("Facility size must be greater than zero.");
    });

    test("rejects omitted terms, which total zero", async () => {
      const { status, body } = await register(good({ terms: undefined }));
      expect(status).toBe(400);
      expect(body.problems).toContain("Facility size must be greater than zero.");
    });

    test("rejects caps above the advance the haircut allows", async () => {
      const { status, body } = await register(
        good({ terms: { seniorCapUsd: 90_000, juniorCapUsd: 0, subordinateCapUsd: 0, seniorRatePct: 5, juniorRatePct: 10, subordinateRatePct: 18 } }),
      );
      expect(status).toBe(400);
      expect(body.problems?.join(" ")).toContain("advance available after the 15% haircut");
    });

    test("accepts caps totalling exactly the advance", async () => {
      const { status } = await register(
        good({ terms: { seniorCapUsd: 85_000, juniorCapUsd: 0, subordinateCapUsd: 0, seniorRatePct: 5, juniorRatePct: 10, subordinateRatePct: 18 } }),
      );
      expect(status).toBe(200);
    });

    test("explains that the haircut is the lenders' protection", async () => {
      const { body } = await register(
        good({ terms: { seniorCapUsd: 900_000, juniorCapUsd: 0, subordinateCapUsd: 0, seniorRatePct: 5, juniorRatePct: 10, subordinateRatePct: 18 } }),
      );
      expect(body.problems?.join(" ")).toContain("lenders' protection");
    });

    test("rejects a senior rate above the junior rate", async () => {
      const { status, body } = await register(
        good({ terms: { seniorCapUsd: 50_000, juniorCapUsd: 25_000, subordinateCapUsd: 0, seniorRatePct: 12, juniorRatePct: 10, subordinateRatePct: 18 } }),
      );
      expect(status).toBe(400);
      expect(body.problems?.join(" ")).toContain("Rates must increase with risk");
    });

    test("rejects a junior rate above the subordinate rate", async () => {
      const { body } = await register(
        good({ terms: { seniorCapUsd: 50_000, juniorCapUsd: 25_000, subordinateCapUsd: 5_000, seniorRatePct: 5, juniorRatePct: 20, subordinateRatePct: 18 } }),
      );
      expect(body.problems?.join(" ")).toContain("Rates must increase with risk");
    });

    test("accepts equal rates across tranches", async () => {
      const { status } = await register(
        good({ terms: { seniorCapUsd: 50_000, juniorCapUsd: 25_000, subordinateCapUsd: 5_000, seniorRatePct: 7, juniorRatePct: 7, subordinateRatePct: 7 } }),
      );
      expect(status).toBe(200);
    });

    test("rejects a rate above 100%", async () => {
      const { body } = await register(
        good({ terms: { seniorCapUsd: 50_000, juniorCapUsd: 25_000, subordinateCapUsd: 5_000, seniorRatePct: 5, juniorRatePct: 10, subordinateRatePct: 101 } }),
      );
      expect(body.problems).toContain("Rates above 100% are rejected.");
    });

    test("says why senior cannot pay more than the tranches beneath it", async () => {
      const { body } = await register(
        good({ terms: { seniorCapUsd: 50_000, juniorCapUsd: 25_000, subordinateCapUsd: 0, seniorRatePct: 12, juniorRatePct: 10, subordinateRatePct: 18 } }),
      );
      expect(body.problems?.join(" ")).toContain("paid first");
    });

    test("allows a two-tranche facility with no subordinate", async () => {
      const { status, body } = await register(
        good({ terms: { seniorCapUsd: 50_000, juniorCapUsd: 25_000, subordinateCapUsd: 0, seniorRatePct: 5, juniorRatePct: 10, subordinateRatePct: 18 } }),
      );
      expect(status).toBe(200);
      expect(body.collateral.financingRequestedUsd).toBe(75_000);
    });

    test("stores the posted terms with a timestamp", async () => {
      const { body } = await register(good());
      expect(body.collateral.terms.seniorCapUsd).toBe(50_000);
      expect(typeof body.collateral.terms.postedAt).toBe("string");
    });
  });

  describe("derived fields", () => {
    test("sets the facility size from the tranche caps", async () => {
      const { body } = await register(good());
      expect(body.collateral.financingRequestedUsd).toBe(85_000);
    });

    test("derives the advance rate from the haircut", async () => {
      const { body } = await register(
        good({
          haircutPct: 22,
          terms: { seniorCapUsd: 40_000, juniorCapUsd: 20_000, subordinateCapUsd: 10_000, seniorRatePct: 5, juniorRatePct: 10, subordinateRatePct: 18 },
        }),
      );
      expect(body.collateral.advanceRatePct).toBe(78);
    });

    test("derives a document hash when the caller did not sign one", async () => {
      const { body } = await register(good());
      expect(body.collateral.docHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    test("derives the same hash for the same document, twice", async () => {
      const first = await register(good());
      await freshStore();
      const second = await register(good());
      expect(second.body.collateral.docHash).toBe(first.body.collateral.docHash);
    });

    test("derives a different hash when the document identifier differs", async () => {
      const first = await register(good());
      await freshStore();
      const second = await register(good({ docIdentifier: "WR-2026-999" }));
      expect(second.body.collateral.docHash).not.toBe(first.body.collateral.docHash);
    });

    test("derives a different hash when the face value differs", async () => {
      const first = await register(good());
      await freshStore();
      const second = await register(good({ faceValueUsd: 100_001 }));
      expect(second.body.collateral.docHash).not.toBe(first.body.collateral.docHash);
    });

    test("prefers the signed document hash over the derived one", async () => {
      const { body } = await register(good({ onChain: { docHash: DOC_HASH, txHash: TX } }));
      expect(body.collateral.docHash).toBe(DOC_HASH);
    });

    test("derives the id from the document hash", async () => {
      const { body } = await register(good({ onChain: { docHash: DOC_HASH, txHash: TX } }));
      expect(body.collateral.id).toBe(`col-${DOC_HASH.slice(2, 10)}`);
    });

    test("derives the token id from the document hash", async () => {
      const { body } = await register(good({ onChain: { docHash: DOC_HASH, txHash: TX } }));
      expect(body.collateral.nftTokenId).toBe(DOC_HASH.slice(2, 10));
    });

    test("slugs the symbol from the document identifier", async () => {
      const { body } = await register(good({ docIdentifier: "wr-2026-441" }));
      expect(body.collateral.symbol).toBe("WR-2026-441");
    });

    test("replaces punctuation in the symbol with dashes", async () => {
      const { body } = await register(good({ docIdentifier: "WR/2026 441#x" }));
      expect(body.collateral.symbol).toBe("WR-2026-441-X");
    });

    test("caps the symbol at twenty characters", async () => {
      const { body } = await register(good({ docIdentifier: "A".repeat(40) }));
      expect(body.collateral.symbol).toHaveLength(20);
    });

    test("blends the coupon across the tranches, weighted by cap", async () => {
      // (50000*5 + 25000*10 + 10000*18) / 85000 = 8.0
      const { body } = await register(good());
      expect(body.collateral.currentRatePct).toBe(8);
    });

    test("rounds the blended coupon to two places", async () => {
      const { body } = await register(
        good({ terms: { seniorCapUsd: 30_000, juniorCapUsd: 20_000, subordinateCapUsd: 7_000, seniorRatePct: 5, juniorRatePct: 10, subordinateRatePct: 18 } }),
      );
      expect(body.collateral.currentRatePct).toBe(
        Math.round((body.collateral.currentRatePct * 100)) / 100,
      );
    });

    test("takes the target rate from the senior tranche", async () => {
      const { body } = await register(good());
      expect(body.collateral.targetRatePct).toBe(5);
    });

    test("starts a new facility CLEAR", async () => {
      const { body } = await register(good());
      expect(body.collateral.status).toBe("CLEAR");
    });

    test("a brand-new registration has clear title by construction", async () => {
      const { body } = await register(good());
      expect(body.collateral.verifiedClearTitle).toBe(true);
    });
  });

  describe("risk, which is derived from the haircut and nothing else", () => {
    test("a haircut of 20 or more reads Low", async () => {
      const { body } = await register(
        good({ haircutPct: 20, terms: { seniorCapUsd: 40_000, juniorCapUsd: 20_000, subordinateCapUsd: 10_000, seniorRatePct: 5, juniorRatePct: 10, subordinateRatePct: 18 } }),
      );
      expect(body.collateral.riskLabel).toBe("Low");
    });

    test("a haircut between 12 and 20 reads Medium", async () => {
      const { body } = await register(good({ haircutPct: 15 }));
      expect(body.collateral.riskLabel).toBe("Medium");
    });

    test("a haircut of exactly 12 reads Medium", async () => {
      const { body } = await register(good({ haircutPct: 12 }));
      expect(body.collateral.riskLabel).toBe("Medium");
    });

    test("a haircut below 12 reads High", async () => {
      const { body } = await register(good({ haircutPct: 5 }));
      expect(body.collateral.riskLabel).toBe("High");
    });

    test("the risk score falls as the haircut rises", async () => {
      const thin = await register(good({ haircutPct: 5 }));
      await freshStore();
      const thick = await register(
        good({ haircutPct: 30, terms: { seniorCapUsd: 40_000, juniorCapUsd: 20_000, subordinateCapUsd: 5_000, seniorRatePct: 5, juniorRatePct: 10, subordinateRatePct: 18 } }),
      );
      expect(thick.body.collateral.riskScore).toBeLessThan(thin.body.collateral.riskScore);
    });

    test("the risk score never leaves 0.05 to 0.95", async () => {
      const { body } = await register(good({ haircutPct: 0 }));
      expect(body.collateral.riskScore).toBeLessThanOrEqual(0.95);
      expect(body.collateral.riskScore).toBeGreaterThanOrEqual(0.05);
    });
  });

  describe("provenance — the part that must never overclaim", () => {
    test("an unsigned registration reports chain: false", async () => {
      const { body } = await register(good());
      expect(body.chain).toBe(false);
    });

    test("an unsigned registration is labelled a simulation in the record", async () => {
      const { body } = await register(good());
      expect(body.collateral.source).toBe("mock");
    });

    test("an unsigned registration carries no on-chain references at all", async () => {
      const { body } = await register(good());
      expect(body.collateral.onChainRefs).toBeUndefined();
    });

    test("an unsigned registration reports no transaction hash", async () => {
      const { body } = await register(good());
      expect(body.txHash).toBeNull();
    });

    test("a signed registration reports chain: true", async () => {
      const { body } = await register(good({ onChain: { docHash: DOC_HASH, txHash: TX } }));
      expect(body.chain).toBe(true);
    });

    test("a signed registration is sourced to the Creditcoin registry", async () => {
      const { body } = await register(good({ onChain: { docHash: DOC_HASH, txHash: TX } }));
      expect(body.collateral.source).toBe("creditcoin-registry");
    });

    test("needs both the hash and the transaction to count as signed", async () => {
      const noHash = await register(good({ onChain: { txHash: TX } }));
      expect(noHash.body.chain).toBe(false);
      await freshStore();
      const noTx = await register(good({ onChain: { docHash: DOC_HASH } }));
      expect(noTx.body.chain).toBe(false);
    });

    test("keeps the two Creditcoin receipts apart", async () => {
      const registerTx = "0x" + "aa".repeat(32);
      const termsTx = "0x" + "bb".repeat(32);
      const { body } = await register(
        good({ onChain: { docHash: DOC_HASH, txHash: termsTx, registerTx, termsTx } }),
      );
      expect(body.collateral.onChainRefs?.creditcoinRegisterTx).toBe(registerTx);
      expect(body.collateral.onChainRefs?.creditcoinTermsTx).toBe(termsTx);
    });

    test("falls back to txHash for the terms receipt when only one was sent", async () => {
      const { body } = await register(good({ onChain: { docHash: DOC_HASH, txHash: TX } }));
      expect(body.collateral.onChainRefs?.creditcoinTermsTx).toBe(TX);
    });

    test("records the registry and vault addresses the caller signed against", async () => {
      const registry = "0x" + "1e".repeat(20);
      const vault = "0x" + "2f".repeat(20);
      const { body } = await register(
        good({ onChain: { docHash: DOC_HASH, txHash: TX, registryAddress: registry, vaultAddress: vault } }),
      );
      expect(body.collateral.registryAddress).toBe(registry);
      expect(body.collateral.vaultAddress).toBe(vault);
    });

    test("uses the zero address when nothing was signed", async () => {
      const { body } = await register(good());
      expect(body.collateral.registryAddress).toBe("0x" + "0".repeat(40));
      expect(body.collateral.vaultAddress).toBe("0x" + "0".repeat(40));
    });
  });

  describe("the note, which has to keep two separate facts apart", () => {
    test("a signed registration says it reached Creditcoin", async () => {
      const { body } = await register(good({ onChain: { docHash: DOC_HASH, txHash: TX } }));
      expect(body.note).toContain("Registered on Creditcoin CC3");
    });

    test("an unsigned registration against a live registry blames the signature, not the registry", async () => {
      deps.creditcoinLive = true;
      const { body } = await register(good());
      expect(body.note).toContain("was not");
      expect(body.note).toContain("signed");
      expect(body.note).toContain("deployed and live");
    });

    test("an unsigned registration with no registry says so, and quotes the reason", async () => {
      deps.creditcoinLive = false;
      deps.notes = { sepolia: "mock requested", creditcoin: "deployments file is missing" };
      const { body } = await register(good());
      expect(body.note).toContain("no registry is connected");
      expect(body.note).toContain("deployments file is missing");
    });

    test("never interpolates a live address into a sentence that denies one", async () => {
      // The old message read "no live registry is connected (live at 0x1E67…)".
      deps.creditcoinLive = true;
      deps.notes = { sepolia: "mock requested", creditcoin: "live at 0x1E67" };
      const { body } = await register(good());
      expect(body.note).not.toContain("no registry is connected");
    });

    test("always says nothing was written to a chain when nothing was", async () => {
      const { body } = await register(good());
      expect(body.note).toContain("Nothing was written to a chain");
    });
  });

  describe("duplicate registration, which is the condition the protocol detects", () => {
    test("409s a second registration of the same document", async () => {
      await register(good());
      const { status } = await register(good());
      expect(status).toBe(409);
    });

    test("names the asset in the conflict", async () => {
      await register(good());
      const { body } = await register(good());
      expect(body.problems?.join(" ")).toContain("already registered");
    });

    test("does not overwrite the first registration", async () => {
      const first = await register(good());
      await register(good({ title: "A Different Title" }));
      const { GET } = await import("@/app/api/collateral/[id]/route");
      const { body } = await json<{ collateral: { title: string } }>(
        await GET(get(`/api/collateral/${first.body.collateral.id}`), {
          params: Promise.resolve({ id: first.body.collateral.id }),
        }),
      );
      expect(body.collateral.title).toBe("Antwerp Copper Cathode Receipt");
    });

    test("allows a different document from the same obligor", async () => {
      await register(good());
      const { status } = await register(good({ docIdentifier: "WR-2026-442" }));
      expect(status).toBe(200);
    });
  });
});
