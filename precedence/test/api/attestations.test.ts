/**
 * `GET /api/attestations` — the Attestcoin records the app has on file.
 *
 * @remarks A short route with one property that matters a great deal: every explorer URL it hands
 * out has to point at a host that resolves. `explorer.cc3-testnet.creditcoin.network` appears in
 * the protocol documentation and does not exist, and a judge clicking a dead link is the failure
 * mode this project cannot afford. So the base is asserted, not assumed.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { resetFakes } from "../helpers/fakes";
import { freshStore } from "../helpers/fixtures";
import { json } from "../helpers/http";

const route = () => import("@/app/api/attestations/route");

interface Body {
  ok: boolean;
  count: number;
  attestations: {
    raceId: string;
    collateralId: string;
    proverId: string;
    sourceBlockNumber: number;
    sourceTxIndex: number;
    status: string;
    score: number;
    explorerUrl: string;
    sourceExplorerUrl: string;
    creditcoinTxHash: string;
    sepoliaTxHash: string;
  }[];
}

describe("GET /api/attestations", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
  });

  test("answers 200", async () => {
    const { GET } = await route();
    expect((await GET()).status).toBe(200);
  });

  test("reports ok", async () => {
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.ok).toBe(true);
  });

  test("count agrees with the array", async () => {
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.count).toBe(body.attestations.length);
  });

  test("returns the seeded attestation", async () => {
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.attestations).toHaveLength(1);
  });

  test("ties the attestation to its race", async () => {
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.attestations[0].raceId).toBe("seed-race-8802");
  });

  test("names the prover that produced it", async () => {
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.attestations[0].proverId).toBe("kestrel");
  });

  test("carries the canonical source position, both halves of it", async () => {
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.attestations[0].sourceBlockNumber).toBe(6182101);
    expect(body.attestations[0].sourceTxIndex).toBe(17);
  });

  test("points the Creditcoin link at the explorer that resolves", async () => {
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.attestations[0].explorerUrl).toStartWith(
      "https://creditcoin-testnet.blockscout.com/tx/",
    );
  });

  test("never points at the documented explorer host that does not resolve", async () => {
    const { GET } = await route();
    const raw = JSON.stringify(await (await GET()).json());
    expect(raw).not.toContain("explorer.cc3-testnet.creditcoin.network");
  });

  test("points the source link at Sepolia's explorer", async () => {
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.attestations[0].sourceExplorerUrl).toStartWith("https://sepolia.etherscan.io/tx/");
  });

  test("keeps the fixture's hashes visibly labelled as samples", async () => {
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.attestations[0].sepoliaTxHash).toContain("SAMPLE");
  });

  test("reports the record's own status rather than inferring one", async () => {
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.attestations[0].status).toBe("confirmed");
  });

  test("returns an empty list, not an error, once the store is cleared", async () => {
    const { getDb } = await import("@/lib/precedence/store/json-store");
    getDb().attestations.length = 0;
    const { GET } = await route();
    const { status, body } = await json<Body>(await GET());
    expect(status).toBe(200);
    expect(body.count).toBe(0);
    expect(body.attestations).toEqual([]);
  });

  test("reflects a newly recorded attestation", async () => {
    const { upsertAttestation } = await import("@/lib/precedence/store/repositories");
    const seeded = await (await import("@/lib/precedence/store/repositories")).listAttestations();
    await upsertAttestation({ ...seeded[0], raceId: "another-race" });
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.count).toBe(2);
  });

  test("upserts by race rather than appending a duplicate", async () => {
    const repos = await import("@/lib/precedence/store/repositories");
    const seeded = await repos.listAttestations();
    await repos.upsertAttestation({ ...seeded[0], score: 42 });
    const { GET } = await route();
    const { body } = await json<Body>(await GET());
    expect(body.count).toBe(1);
    expect(body.attestations[0].score).toBe(42);
  });
});
