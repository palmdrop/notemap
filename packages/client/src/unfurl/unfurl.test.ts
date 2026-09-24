import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import { createClient } from "../client";
import { Refused } from "../errors";
import { asked, routeOf } from "#testing/pool";
import { json, mockTransport, refusal, type Handler } from "#testing/transport";

const LINK = "https://example.org/a?b=c&d";

function clientOver(unfurl: boolean | undefined, handler: Handler) {
  const transport = mockTransport((request) => {
    if (routeOf(request) === "GET /v1/settings") {
      return json(200, {
        values: unfurl === undefined ? [] : [{ name: "unfurl", value: unfurl }],
      });
    }
    return handler(request);
  });
  const client = createClient({ transport, store: createMemoryStore() });
  return { client, transport };
}

const unfurls = (transport: { sent: readonly Request[] }) =>
  asked(transport).filter((request) => routeOf(request) === "GET /v1/unfurl");

describe("unfurling a link", () => {
  it("asks the daemon for the link, and answers what it read", async () => {
    const { client, transport } = clientOver(true, () =>
      json(200, { url: LINK, reached: true, title: "A" }),
    );
    await client.settings.load();

    expect(await client.unfurl(LINK)).toEqual({
      url: LINK,
      reached: true,
      title: "A",
    });
    const [request] = unfurls(transport);
    expect(new URL(request?.url ?? "").searchParams.get("url")).toBe(LINK);
  });

  it("hands a refusal back as the client's own", async () => {
    const { client } = clientOver(true, () =>
      refusal(422, "address-refused", { url: LINK }),
    );
    await client.settings.load();

    const refused = client.unfurl(LINK);
    await expect(refused).rejects.toBeInstanceOf(Refused);
    await expect(refused).rejects.toMatchObject({ code: "address-refused" });
  });

  it("asks nothing while the pool setting is off", async () => {
    const { client, transport } = clientOver(false, () =>
      json(200, { url: LINK, reached: true }),
    );
    await client.settings.load();

    expect(await client.unfurl(LINK)).toBeUndefined();
    expect(unfurls(transport)).toEqual([]);
  });

  it("asks nothing before the pool setting has been read", async () => {
    const { client, transport } = clientOver(true, () =>
      json(200, { url: LINK, reached: true }),
    );

    expect(await client.unfurl(LINK)).toBeUndefined();
    expect(unfurls(transport)).toEqual([]);
  });

  it("asks nothing where the pool does not know the setting", async () => {
    const { client, transport } = clientOver(undefined, () =>
      json(200, { url: LINK, reached: true }),
    );
    await client.settings.load();

    expect(await client.unfurl(LINK)).toBeUndefined();
    expect(unfurls(transport)).toEqual([]);
  });
});
