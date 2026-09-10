import {
  NotOffered,
  Rejected,
  Unusable,
  type CapabilityName,
  type DeliveredOutput,
  type DeliveryOutcome,
  type DestinationKindAdapter,
} from "@notemap/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { arenaRenderers } from "./blocks";
import { createArenaDestination } from "./destination";
import {
  bytes,
  deliveredAsset,
  delivery,
  destinationRow,
  resolverFor,
  startArenaServer,
  type ArenaServer,
} from "./testing";

let server: ArenaServer;

beforeEach(async () => {
  server = await startArenaServer();
});

afterEach(async () => {
  await server.close();
});

function adapter(): DestinationKindAdapter {
  return createArenaDestination({
    renderers: arenaRenderers(),
    credentials: resolverFor(server),
    baseUrl: server.url,
    uploadsUrl: server.uploadsUrl,
    webUrl: "https://www.are.na",
  });
}

const row = () => destinationRow();

async function textOf(output: DeliveredOutput | undefined): Promise<string> {
  const content = output?.content;
  if (content === undefined) throw new Error("it answered no content");

  const chunks: Uint8Array[] = [];
  for await (const chunk of await content.open()) chunks.push(chunk);
  return chunks.map((chunk) => new TextDecoder().decode(chunk)).join("");
}

function delivered(outcome: DeliveryOutcome) {
  if (outcome.kind !== "delivered") {
    throw new Error(`not delivered: ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

describe("what it says it can do", () => {
  it("declares one capability, over the types it has a block form for", async () => {
    const described = await adapter().describe(row());

    expect(described.capabilities.map((each) => each.name)).toEqual(["create"]);
    expect(described.capabilities[0]?.accepts).toEqual(["note"]);
  });

  /**
   * A destination must be routable while are.na is asleep, which is the property
   * deferred delivery rests on. Nothing was asked of the server here.
   */
  it("touches the network for nothing", async () => {
    await adapter().describe(row());

    expect(server.requests()).toEqual([]);
  });

  it("says its channel can be browsed", async () => {
    const described = await adapter().describe(row());
    const properties = (
      described.capabilities[0]?.argumentsSchema as Record<string, unknown>
    )["properties"] as Record<string, Record<string, unknown>>;

    expect(properties["channel"]).toHaveProperty("x-notemap-candidates", true);
  });

  /**
   * `accepts` derives from the renderers, so a payload type with no block form
   * is refused by core before a decision is made rather than landing as noise.
   */
  it("accepts nothing it has no renderer for", async () => {
    const bare = createArenaDestination({
      renderers: {},
      credentials: resolverFor(server),
      baseUrl: server.url,
    });

    expect((await bare.describe(row())).capabilities[0]?.accepts).toEqual([]);
  });
});

describe("creating a block", () => {
  it("puts the text in a channel and answers where it landed", async () => {
    const outcome = delivered(
      await adapter().deliver(
        row(),
        delivery({ arguments: { channel: "reading" } }),
      ),
    );

    expect(outcome.pointer).toBe("1001");
    expect(outcome.url).toBe("https://www.are.na/block/1001");
    expect(server.blocks()).toEqual([
      expect.objectContaining({ value: "a thought", channel_ids: ["reading"] }),
    ]);
  });

  /** The channel takes either, because are.na does; an ID survives a retitle. */
  it("takes a numeric id where one was pasted instead of a slug", async () => {
    await adapter().deliver(
      row(),
      delivery({ arguments: { channel: "12345" } }),
    );

    expect(server.blocks()[0]).toMatchObject({ channel_ids: ["12345"] });
  });

  it("writes where it came from into the block's own metadata", async () => {
    await adapter().deliver(row(), delivery({ tags: ["kind/quote"] }));

    expect(server.blocks()[0]).toMatchObject({
      metadata: expect.objectContaining({
        id: "item-1",
        capture_source: "scratchpad",
        derived_from: "urn:commons:item:item-1",
        tags: "kind/quote",
      }),
    });
  });

  it("says what it wrote, and what a block could not carry", async () => {
    const outcome = delivered(
      await adapter().deliver(row(), delivery({ tags: ["kind/quote"] })),
    );

    expect(await textOf(outcome.output)).toBe("a thought\n");
    expect(outcome.output?.note).toContain("its tags");
  });

  it("refuses a capability it does not declare", async () => {
    const outcome = await adapter().deliver(
      row(),
      delivery({ capability: "append" as CapabilityName }),
    );

    expect(outcome).toEqual({
      kind: "rejected",
      detail: expect.stringContaining("no capability named append"),
    });
  });

  it("refuses arguments naming no channel", async () => {
    const outcome = await adapter().deliver(row(), delivery({ arguments: {} }));

    expect(outcome.kind).toBe("rejected");
  });

  /**
   * A guard rather than a case: the client builds `assets` as zero-or-one, so
   * only a direct `/v1` caller trips it.
   */
  it("refuses a capture carrying more than one asset", async () => {
    const outcome = await adapter().deliver(
      row(),
      delivery({
        assets: [
          deliveredAsset("a", "one.png", bytes("one")),
          deliveredAsset("b", "two.png", bytes("two")),
        ],
      }),
    );

    expect(outcome).toEqual({
      kind: "rejected",
      detail: expect.stringContaining("more than one asset"),
    });
  });
});

describe("an image capture", () => {
  it("presigns, sends the bytes, and makes the block from where they landed", async () => {
    const asset = deliveredAsset("main", "mum.png", bytes("the-bytes"));
    const outcome = delivered(
      await adapter().deliver(
        row(),
        delivery({ content: { text: "mum, 1994" }, assets: [asset] }),
      ),
    );

    expect(server.uploads()).toEqual({ "uploads/0-mum.png": "the-bytes" });
    expect(server.blocks()[0]).toMatchObject({
      value: `${server.uploadsUrl}/uploads/0-mum.png`,
      description: "mum, 1994",
      alt_text: "mum, 1994",
    });
    expect(outcome.pointer).toBe("1001");
  });

  /**
   * Under a length rather than chunked: a presigned S3 PUT will not take a
   * chunked body, and the asset registry knows the size without reading it. The
   * bytes are still streamed — nothing here buffers them to measure.
   */
  it("sends the bytes under the length the registry already knew", async () => {
    const asset = deliveredAsset("main", "mum.png", bytes("the-bytes"));
    await adapter().deliver(row(), delivery({ assets: [asset] }));

    expect(server.arrivedChunked("uploads/0-mum.png")).toBe(false);
  });

  it("opens the bytes once, and only when there are bytes to send", async () => {
    const asset = deliveredAsset("main", "mum.png", bytes("the-bytes"));
    await adapter().deliver(row(), delivery({ assets: [asset] }));

    expect(asset.opens()).toBe(1);
  });

  /** Never `rejected`: the URL is minted per attempt and expires within the hour. */
  it("reports a refused upload as unreachable, so the decision is kept", async () => {
    const asset = deliveredAsset("main", "mum.png", bytes("the-bytes"));
    server.answerOnce("/uploads/uploads/0-mum.png", 403);

    const outcome = await adapter().deliver(
      row(),
      delivery({ assets: [asset] }),
    );

    expect(outcome.kind).toBe("unreachable");
    expect(server.blocks()).toEqual([]);
  });
});

describe("what it says it would write", () => {
  it("converts without reaching are.na at all", async () => {
    const shown = await adapter().preview?.(
      row(),
      delivery({ content: { text: "https://example.com/a\n\nwhy" } }),
    );

    expect(await textOf(shown)).toBe("https://example.com/a\n\nwhy\n");
    expect(server.requests()).toEqual([]);
  });

  it("refuses what a delivery would refuse", async () => {
    await expect(
      adapter().preview?.(row(), delivery({ arguments: {} })),
    ).rejects.toBeInstanceOf(Rejected);
  });

  /** The value is the one thing a preview cannot know, so it draws the caption alone. */
  it("shows an image's caption without a blank line where its value would be", async () => {
    const shown = await adapter().preview?.(
      row(),
      delivery({
        content: { text: "a photo of the sea" },
        assets: [deliveredAsset("one", "sea.png", bytes("PNG"))],
      }),
    );

    expect(await textOf(shown)).toBe("a photo of the sea\n");
  });
});

describe("the channels it offers to browse", () => {
  /**
   * The slug is what a decision made once takes, and the numeric ID rides along
   * as the entry's durable form — a slug does not survive a retitle, and a
   * template fires on a tag for months.
   */
  it("answers a slug per channel under its title, and the ID beside it", async () => {
    server.holds([
      { slug: "reading", title: "Reading", id: 12345 },
      { slug: "shapes", title: "Shapes", id: 67890 },
    ]);

    const answer = await adapter().candidates?.(row(), {
      capability: "create" as CapabilityName,
      field: "channel",
    });

    expect(answer).toEqual({
      truncated: false,
      entries: [
        { label: "Reading", value: "reading", durable: "12345" },
        { label: "Shapes", value: "shapes", durable: "67890" },
      ],
    });
  });

  /** A channel is joined, not made, so a pattern expanded into the field names nothing. */
  it("says the channel may hold only something it offered", async () => {
    const described = await adapter().describe(row());
    const properties = (
      described.capabilities[0]?.argumentsSchema as Record<string, unknown>
    )["properties"] as Record<string, Record<string, unknown>>;

    expect(properties["channel"]).toHaveProperty(
      "x-notemap-offered-only",
      true,
    );
  });

  it("drops a channel the token cannot post into, and keeps one that says nothing", async () => {
    server.holds([
      { slug: "reading", title: "Reading", addTo: true },
      { slug: "theirs", title: "Theirs", addTo: false },
      { slug: "unsaid", title: "Unsaid" },
    ]);

    const answer = await adapter().candidates?.(row(), {
      capability: "create" as CapabilityName,
      field: "channel",
    });

    expect(answer?.entries.map((each) => each.value)).toEqual([
      "reading",
      "unsaid",
    ]);
  });

  /** One page, and it says when there were more: browsing is not enumerating. */
  it("says so where the account held more than one page", async () => {
    server.holds([{ slug: "reading", title: "Reading" }], true);

    const answer = await adapter().candidates?.(row(), {
      capability: "create" as CapabilityName,
      field: "channel",
    });

    expect(answer?.truncated).toBe(true);
  });

  it("offers nothing for a field it does not browse", async () => {
    await expect(
      adapter().candidates?.(row(), {
        capability: "create" as CapabilityName,
        field: "title",
      }),
    ).rejects.toBeInstanceOf(NotOffered);
  });
});

describe("what it calls a channel a field already holds", () => {
  /**
   * The whole point of asking: a browse answers one page, so a template pinned
   * to a channel outside it has no name in the list and only this can read one
   * back.
   */
  it("names a channel the browse never listed, by the ID a template holds", async () => {
    server.holds([{ slug: "reading", title: "Reading", id: 12345 }], true);

    const answer = await adapter().naming?.(row(), {
      capability: "create" as CapabilityName,
      field: "channel",
      value: "12345",
    });

    expect(answer).toEqual({
      entry: { label: "Reading", value: "reading", durable: "12345" },
    });
  });

  /** Either name it answers to, because which one a field holds is the surface's business. */
  it("names it by its slug too", async () => {
    server.holds([{ slug: "reading", title: "Reading", id: 12345 }]);

    const answer = await adapter().naming?.(row(), {
      capability: "create" as CapabilityName,
      field: "channel",
      value: "reading",
    });

    expect(answer?.entry?.label).toBe("Reading");
  });

  /** A handle nobody has is an answer and not a failure: a value typed by hand has no name. */
  it("answers nothing for a channel are.na does not have", async () => {
    server.holds([{ slug: "reading", title: "Reading", id: 12345 }]);

    const answer = await adapter().naming?.(row(), {
      capability: "create" as CapabilityName,
      field: "channel",
      value: "67890",
    });

    expect(answer).toEqual({});
  });

  /** Nothing is asked of are.na for a field that holds nothing. */
  it("asks nothing where the field is empty", async () => {
    const answer = await adapter().naming?.(row(), {
      capability: "create" as CapabilityName,
      field: "channel",
      value: "",
    });

    expect(answer).toEqual({});
    expect(server.requests()).toEqual([]);
  });

  it("names nothing for a field it does not browse", async () => {
    await expect(
      adapter().naming?.(row(), {
        capability: "create" as CapabilityName,
        field: "title",
        value: "anything",
      }),
    ).rejects.toBeInstanceOf(NotOffered);
  });
});

describe("asking whether it is really there", () => {
  it("asks who the token is, and nothing more", async () => {
    await adapter().probe?.(row());

    expect(server.requests()).toEqual(["GET /v3/me"]);
  });

  it("rejects a token are.na refused", async () => {
    server.answerOnce("/v3/me", 401, { error: { message: "unauthorized" } });

    await expect(adapter().probe?.(row())).rejects.toBeInstanceOf(Rejected);
  });

  /**
   * Not `unreachable` — a retry is not what gets there — and not a refusal
   * either: nothing was reached, so nothing refused anything.
   */
  it("calls an account nobody declared unusable, as the WebDAV kind does", async () => {
    await expect(
      adapter().probe?.(destinationRow({ account: "elsewhere" })),
    ).rejects.toBeInstanceOf(Unusable);
  });
});

/**
 * A refused token is `unreachable` to a delivery and `rejected` to a probe: one
 * may just have been rotated, and the retry is right to go and find out. What is
 * about the *target* is permanent and abandoned at once.
 */
describe("what a failure means", () => {
  it("keeps the decision where the token was refused", async () => {
    server.answerOnce("/v3/blocks", 401, {
      error: { message: "unauthorized" },
    });

    expect((await adapter().deliver(row(), delivery())).kind).toBe(
      "unreachable",
    );
  });

  it("abandons it where the token cannot write", async () => {
    server.answerOnce("/v3/blocks", 403, {});
    const outcome = await adapter().deliver(row(), delivery());

    expect(outcome.kind).toBe("rejected");
    expect(outcome).toMatchObject({
      detail: expect.stringContaining("read scope rather than write"),
    });
  });

  it("abandons it where the channel is gone, and says a rename is why", async () => {
    server.answerOnce("/v3/blocks", 404, {});
    const outcome = await adapter().deliver(row(), delivery());

    expect(outcome).toMatchObject({
      kind: "rejected",
      detail: expect.stringContaining("renamed"),
    });
  });

  it("abandons it where are.na would not take the block", async () => {
    server.answerOnce("/v3/blocks", 422, {});

    expect((await adapter().deliver(row(), delivery())).kind).toBe("rejected");
  });

  it("keeps the decision where are.na was busy or broken", async () => {
    for (const status of [429, 500, 503]) {
      server.answerOnce("/v3/blocks", status, {});
      expect((await adapter().deliver(row(), delivery())).kind).toBe(
        "unreachable",
      );
    }
  });

  /**
   * The token is attached to the address the adapter chose and to no other, so
   * a redirect is reported rather than chased: following one would carry it to
   * wherever the answer named.
   */
  it("refuses a redirect rather than following it with the token", async () => {
    server.answerOnce("/v3/blocks", 302, {});
    const outcome = await adapter().deliver(row(), delivery());

    expect(outcome).toMatchObject({
      kind: "unreachable",
      detail: expect.stringContaining("token is never carried"),
    });
    expect(server.blocks()).toEqual([]);
  });

  it("keeps the decision where the account could not be resolved", async () => {
    const outcome = await adapter().deliver(
      destinationRow({ account: "elsewhere" }),
      delivery(),
    );

    expect(outcome.kind).toBe("unreachable");
  });
});
