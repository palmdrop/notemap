import { describe, expect, it } from "vitest";

import { Refused } from "../errors";
import { json, mockTransport, refusal } from "../testing/transport";
import { createApi } from "#api/http";
import { createTokens } from "./tokens";

const MINTED = {
  id: "gpeukvybsmmgwnec",
  name: "laptop",
  createdAt: "2026-08-30T09:00:00.000Z",
  token: "nmp.gpeukvybsmmgwnec.qK9v",
};

const over = (handler: Parameters<typeof mockTransport>[0]) => {
  const transport = mockTransport(handler);
  return { tokens: createTokens({ api: createApi(transport) }), transport };
};

describe("the access tokens a person holds", () => {
  it("are listed without a secret among them", async () => {
    const { tokens } = over(() =>
      json(200, { values: [{ ...MINTED, token: undefined }] }),
    );

    const held = await tokens.list();

    expect(held).toHaveLength(1);
    expect(held[0]).not.toHaveProperty("token");
  });

  it("are minted with a name, and answer the secret once", async () => {
    const { tokens, transport } = over(() => json(201, MINTED));

    expect(await tokens.mint({ name: "laptop" })).toMatchObject({
      token: MINTED.token,
    });

    const sent = transport.sent[transport.sent.length - 1] as Request;
    expect(await sent.clone().json()).toEqual({ name: "laptop" });
  });

  it("are revoked one at a time, by id", async () => {
    const { tokens, transport } = over(
      () => new Response(null, { status: 204 }),
    );

    await tokens.revoke("gpeukvybsmmgwnec");

    const sent = transport.sent[transport.sent.length - 1] as Request;
    expect(sent.method).toBe("DELETE");
    expect(new URL(sent.url).pathname).toBe("/v1/tokens/gpeukvybsmmgwnec");
  });

  /**
   * The containment rule, as a client sees it: these are the routes a token
   * cannot reach, and the refusal has to arrive as one rather than as a lapse.
   */
  it("refuse a client carrying a token rather than a session", async () => {
    const { tokens } = over(() => refusal(403, "session-required"));

    await expect(tokens.list()).rejects.toBeInstanceOf(Refused);
  });
});
