/**
 * `POST /api/collateral/parse` — reading a document to pre-fill the registration form.
 *
 * @remarks The one route in the app that a model touches, so the tests are mostly about what it
 * is *not* allowed to do. Nothing it returns is evidence: there is no on-chain record to ratify a
 * document against at registration time, so the borrower's own signature is what makes any of it
 * a claim. The response says that out loud in `advisory`, and a client that lost the advisory
 * would be free to present a guess as a verified reading.
 *
 * The other half is that no model configured is a *normal* state, not a fault. Both the
 * unavailable paths answer 200 with a reason, because a 500 here would make the form look broken
 * when it is perfectly usable by hand.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { deps, proposal, resetFakes } from "../helpers/fakes";
import { freshStore } from "../helpers/fixtures";
import { json, post, postRaw } from "../helpers/http";

const route = () => import("@/app/api/collateral/parse/route");

/** Long enough to clear the 40-character floor. */
const DOC =
  "Warehouse Receipt WR-2026-441. Custodian: Antwerp Bonded Storage, Antwerp, Belgium. " +
  "Obligor: Northwind Metals Ltd. Commodity: 40 tonnes copper cathode.";

interface Body {
  ok: boolean;
  available?: boolean;
  reason?: string;
  error?: string;
  advisory?: string;
  proposal?: { confidence: number; concerns: string[]; model: string; title?: string };
}

async function parse(body: unknown) {
  const { POST } = await route();
  return json<Body>(await POST(post("/api/collateral/parse", body)));
}

describe("POST /api/collateral/parse", () => {
  beforeEach(async () => {
    resetFakes();
    await freshStore();
    process.env.PRECEDENCE_RUNTIME = "local";
  });

  afterEach(() => {
    process.env.PRECEDENCE_RUNTIME = "local";
  });

  describe("the body", () => {
    test("rejects a body that is not JSON", async () => {
      const { POST } = await route();
      const { status, body } = await json<Body>(
        await POST(postRaw("/api/collateral/parse", "<html>")),
      );
      expect(status).toBe(400);
      expect(body.error).toBe("expected a JSON body");
    });

    test("rejects a missing documentText", async () => {
      const { status, body } = await parse({});
      expect(status).toBe(400);
      expect(body.error).toContain("too short to read");
    });

    test("rejects an empty documentText", async () => {
      const { status } = await parse({ documentText: "" });
      expect(status).toBe(400);
    });

    test("rejects whitespace-only text", async () => {
      const { status } = await parse({ documentText: " ".repeat(200) });
      expect(status).toBe(400);
    });

    test("rejects text of 39 characters", async () => {
      const { status } = await parse({ documentText: "x".repeat(39) });
      expect(status).toBe(400);
    });

    test("accepts text of exactly 40 characters", async () => {
      deps.proposeRegistration = async () => proposal();
      const { status } = await parse({ documentText: "x".repeat(40) });
      expect(status).toBe(200);
    });

    test("measures length after trimming", async () => {
      const { status } = await parse({ documentText: "   " + "x".repeat(30) + "   " });
      expect(status).toBe(400);
    });

    test("asks for the document text rather than a file", async () => {
      const { body } = await parse({ documentText: "short" });
      expect(body.error).toContain("paste the document text");
    });
  });

  describe("when no model is configured", () => {
    test("answers 200, because that is a normal state and not a fault", async () => {
      const { status } = await parse({ documentText: DOC });
      expect(status).toBe(200);
    });

    test("reports itself unavailable rather than returning empty fields", async () => {
      const { body } = await parse({ documentText: DOC });
      expect(body.ok).toBe(true);
      expect(body.available).toBe(false);
    });

    test("names the variable to set and says the form still works", async () => {
      const { body } = await parse({ documentText: DOC });
      expect(body.reason).toContain("PRECEDENCE_RUNTIME");
      expect(body.reason).toContain("by hand");
    });

    test("returns no proposal at all", async () => {
      const { body } = await parse({ documentText: DOC });
      expect(body.proposal).toBeUndefined();
    });

    test("distinguishes an agent runtime that cannot read documents", async () => {
      process.env.PRECEDENCE_RUNTIME = "agent";
      const { body } = await parse({ documentText: DOC });
      expect(body.available).toBe(false);
      expect(body.reason).toContain("agent runtime is selected");
    });
  });

  describe("when the model fails", () => {
    test("still answers 200, so a registration is never blocked by a model", async () => {
      deps.proposeRegistration = async () => {
        throw new Error("upstream 503");
      };
      const { status, body } = await parse({ documentText: DOC });
      expect(status).toBe(200);
      expect(body.available).toBe(false);
    });

    test("quotes the failure so it can be diagnosed", async () => {
      deps.proposeRegistration = async () => {
        throw new Error("upstream 503");
      };
      const { body } = await parse({ documentText: DOC });
      expect(body.reason).toContain("could not be reached");
      expect(body.reason).toContain("upstream 503");
    });

    test("truncates a runaway error message", async () => {
      deps.proposeRegistration = async () => {
        throw new Error("x".repeat(5000));
      };
      const { body } = await parse({ documentText: DOC });
      expect((body.reason ?? "").length).toBeLessThan(220);
    });

    test("returns no proposal when the read failed", async () => {
      deps.proposeRegistration = async () => {
        throw new Error("nope");
      };
      const { body } = await parse({ documentText: DOC });
      expect(body.proposal).toBeUndefined();
    });
  });

  describe("when the model reads the document", () => {
    beforeEach(() => {
      deps.proposeRegistration = async () => proposal();
    });

    test("answers 200 and reports itself available", async () => {
      const { status, body } = await parse({ documentText: DOC });
      expect(status).toBe(200);
      expect(body.available).toBe(true);
    });

    test("returns the proposal", async () => {
      const { body } = await parse({ documentText: DOC });
      expect(body.proposal?.title).toBe("40 tonnes copper cathode");
    });

    test("carries the model's own confidence, for display", async () => {
      const { body } = await parse({ documentText: DOC });
      expect(body.proposal?.confidence).toBe(0.95);
    });

    test("carries concerns through untouched", async () => {
      deps.proposeRegistration = async () =>
        proposal({ concerns: ["no issue date", "value written over"] });
      const { body } = await parse({ documentText: DOC });
      expect(body.proposal?.concerns).toEqual(["no issue date", "value written over"]);
    });

    test("names the model that produced it", async () => {
      const { body } = await parse({ documentText: DOC });
      expect(body.proposal?.model).toBe("test-double");
    });

    test("passes the trimmed document text to the runtime", async () => {
      let seen = "";
      deps.proposeRegistration = async (t) => {
        seen = t;
        return proposal();
      };
      await parse({ documentText: `  ${DOC}  ` });
      expect(seen).toBe(DOC);
    });

    test("says nothing here is verified", async () => {
      const { body } = await parse({ documentText: DOC });
      expect(body.advisory).toContain("Nothing here is verified");
    });

    test("says nothing has been registered", async () => {
      const { body } = await parse({ documentText: DOC });
      expect(body.advisory).toContain("nothing has been registered");
    });

    test("tells the borrower they are the one signing it", async () => {
      const { body } = await parse({ documentText: DOC });
      expect(body.advisory).toContain("you are the one signing it");
    });

    test("registers nothing — a pre-fill must not create a facility", async () => {
      const before = await import("@/lib/precedence/store/repositories");
      const count = (await before.listCollateral()).length;
      await parse({ documentText: DOC });
      expect((await before.listCollateral()).length).toBe(count);
    });
  });
});
