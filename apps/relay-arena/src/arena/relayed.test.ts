import { describe, expect, it } from "vitest";

import { relayedFrom } from "./relayed";
import type { ArenaBlock } from "./types";

const bytes = () => Promise.resolve(new TextEncoder().encode("BYTES"));

function block(overrides: Partial<ArenaBlock> = {}): ArenaBlock {
  return {
    id: 123,
    type: "Text",
    connection: { connected_at: "2026-09-04T14:23:05Z" },
    ...overrides,
  };
}

describe("a block as the pool takes it", () => {
  it("carries a Text block's prose verbatim, and connected_at as capturedAt", () => {
    const relaying = relayedFrom(
      block({ content: { markdown: "a thought" } }),
      bytes,
      { tags: [], hashtags: false },
    );

    expect(relaying).toEqual({
      sourceItemId: "123",
      version: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      capturedAt: "2026-09-04T14:23:05Z",
      text: "a thought",
      tags: [],
      attachments: [],
    });
  });

  it("composes a Link block's title, caption and source URL into prose", () => {
    const relaying = relayedFrom(
      block({
        type: "Link",
        title: "A title",
        description: { markdown: "A caption" },
        source: { url: "https://example.com/page" },
      }),
      bytes,
      { tags: ["arena/influences"], hashtags: false },
    );

    expect(relaying).toMatchObject({
      text: "A title\n\nA caption\n\nhttps://example.com/page",
      tags: ["arena/influences"],
    });
  });

  it("composes an Embed block the same way as a Link, and carries no attachment", () => {
    const relaying = relayedFrom(
      block({
        type: "Embed",
        title: "A video",
        source: { url: "https://vimeo.com/1" },
        image: {
          filename: "thumb.jpg",
          content_type: "image/jpeg",
          src: "https://images.example.com/thumb.jpg",
        },
      }),
      bytes,
      { tags: [], hashtags: false },
    );

    expect(relaying).toMatchObject({
      text: "A video\n\nhttps://vimeo.com/1",
      attachments: [],
    });
  });

  it("carries an Image block's stored image, captioned by title and description", () => {
    const relaying = relayedFrom(
      block({
        type: "Image",
        title: "A picture",
        image: {
          filename: "a.png",
          content_type: "image/png",
          src: "https://images.example.com/a.png",
        },
      }),
      bytes,
      { tags: [], hashtags: false },
    );

    expect(relaying).toMatchObject({
      text: "A picture",
      attachments: [
        { id: "block/123/image", filename: "a.png", mime: "image/png" },
      ],
    });
  });

  it("carries an Attachment block's file under the same composed id, and no text where it has none", () => {
    const relaying = relayedFrom(
      block({
        type: "Attachment",
        attachment: {
          filename: "a.pdf",
          content_type: "application/pdf",
          url: "https://attachments.example.com/a.pdf",
        },
      }),
      bytes,
      { tags: [], hashtags: false },
    );

    expect(relaying).toMatchObject({
      attachments: [
        { id: "block/123/image", filename: "a.pdf", mime: "application/pdf" },
      ],
    });
    expect(relaying && "text" in relaying).toBe(false);
  });

  it("names an Image's file by a title that is only the uploaded file's name, and keeps it out of the prose", () => {
    const image = {
      filename: "495ca161.png",
      content_type: "image/png",
      src: "https://images.example.com/495ca161.png",
    };

    const untitled = relayedFrom(
      block({ type: "Image", title: "098__resnet-bitstamp.png", image }),
      bytes,
      { tags: [], hashtags: false },
    );
    expect(untitled).not.toHaveProperty("text");
    expect(untitled?.attachments[0]?.filename).toBe("098__resnet-bitstamp.png");

    const titled = relayedFrom(
      block({ type: "Image", title: "a scan.png", image }),
      bytes,
      { tags: [], hashtags: false },
    );
    expect(titled?.text).toBe("a scan.png");
    expect(titled?.attachments[0]?.filename).toBe("495ca161.png");
  });

  it("versions a block by what it says, not by when are.na last touched it", () => {
    const one = relayedFrom(block({ content: { markdown: "a" } }), bytes, {
      tags: [],
      hashtags: false,
    });
    const again = relayedFrom(
      block({
        content: { markdown: "a" },
        connection: { connected_at: "2027-01-01T00:00:00Z" },
      }),
      bytes,
      { tags: [], hashtags: false },
    );
    const edited = relayedFrom(block({ content: { markdown: "b" } }), bytes, {
      tags: [],
      hashtags: false,
    });

    expect(again?.version).toBe(one?.version);
    expect(edited?.version).not.toBe(one?.version);
  });

  it("reads a foot of tags off a block's prose where it was asked to, after the channel's", () => {
    const relaying = relayedFrom(
      block({ content: { markdown: "a thought\n\n#kind/quote #topic/x" } }),
      bytes,
      { tags: ["arena/influences"], hashtags: true },
    );

    expect(relaying).toMatchObject({
      text: "a thought",
      tags: ["arena/influences", "kind/quote", "topic/x"],
    });
  });

  it("leaves the foot in the prose where it was not asked", () => {
    const relaying = relayedFrom(
      block({ content: { markdown: "a thought\n\n#kind/quote" } }),
      bytes,
      { tags: ["arena/influences"], hashtags: false },
    );

    expect(relaying).toMatchObject({
      text: "a thought\n\n#kind/quote",
      tags: ["arena/influences"],
    });
  });

  it("versions the prose the payload carries, so a foot edited alone is not an edit", () => {
    const withFoot = (markdown: string) =>
      relayedFrom(block({ content: { markdown } }), bytes, {
        tags: [],
        hashtags: true,
      })?.version;

    expect(withFoot("a thought\n\n#kind/quote")).toBe(
      withFoot("a thought\n\n#kind/quote #topic/x"),
    );
    expect(withFoot("a thought\n\n#kind/quote")).not.toBe(
      withFoot("another thought\n\n#kind/quote"),
    );
  });

  it("carries a Text block's title above its prose, and the page it was saved from below", () => {
    const relaying = relayedFrom(
      block({
        title: "A quote",
        content: { markdown: "a thought" },
        source: { url: "https://example.com/essay" },
      }),
      bytes,
      { tags: [], hashtags: false },
    );

    expect(relaying?.text).toBe(
      "A quote\n\na thought\n\nhttps://example.com/essay",
    );
  });

  it("carries the page an Image or an Attachment was saved from", () => {
    const image = relayedFrom(
      block({
        type: "Image",
        title: "A picture",
        description: { markdown: "A caption" },
        source: { url: "https://example.com/gallery" },
        image: {
          filename: "a.png",
          content_type: "image/png",
          src: "https://images.example.com/a.png",
        },
      }),
      bytes,
      { tags: [], hashtags: false },
    );
    expect(image?.text).toBe(
      "A picture\n\nA caption\n\nhttps://example.com/gallery",
    );

    const attachment = relayedFrom(
      block({
        type: "Attachment",
        source: { url: "https://example.com/paper.pdf" },
        attachment: {
          filename: "a.pdf",
          content_type: "application/pdf",
          url: "https://attachments.example.com/a.pdf",
        },
      }),
      bytes,
      { tags: [], hashtags: false },
    );
    expect(attachment?.text).toBe("https://example.com/paper.pdf");
  });

  it("leaves the source URL out where the block's own words already hold it", () => {
    const relaying = relayedFrom(
      block({
        content: { markdown: "read this: https://example.com/essay" },
        source: { url: "https://example.com/essay" },
      }),
      bytes,
      { tags: [], hashtags: false },
    );

    expect(relaying?.text).toBe("read this: https://example.com/essay");
  });

  it("reads the foot off the block's own words before the source URL is put after them", () => {
    const text = relayedFrom(
      block({
        content: { markdown: "a thought\n\n#kind/quote" },
        source: { url: "https://example.com/essay" },
      }),
      bytes,
      { tags: [], hashtags: true },
    );
    expect(text).toMatchObject({
      text: "a thought\n\nhttps://example.com/essay",
      tags: ["kind/quote"],
    });

    const link = relayedFrom(
      block({
        type: "Link",
        title: "A title",
        description: { markdown: "A caption\n#topic/x" },
        source: { url: "https://example.com/page" },
      }),
      bytes,
      { tags: [], hashtags: true },
    );
    expect(link).toMatchObject({
      text: "A title\n\nA caption\n\nhttps://example.com/page",
      tags: ["topic/x"],
    });
  });

  it("never reads a title as a foot", () => {
    const relaying = relayedFrom(
      block({ type: "Link", title: "#kind/quote" }),
      bytes,
      { tags: [], hashtags: true },
    );

    expect(relaying).toMatchObject({ text: "#kind/quote", tags: [] });
  });

  it("carries a Channel block as a link to the channel, under an identity a block cannot hold", () => {
    const relaying = relayedFrom(
      block({
        type: "Channel",
        title: "Adam Curtis",
        slug: "adam-curtis",
        description: { markdown: "Films and notes" },
      }),
      bytes,
      { tags: ["arena/influences"], hashtags: false },
    );

    expect(relaying).toEqual({
      sourceItemId: "channel/123",
      version: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      capturedAt: "2026-09-04T14:23:05Z",
      text: "Adam Curtis\n\nFilms and notes\n\nhttps://www.are.na/channel/adam-curtis",
      tags: ["arena/influences"],
      attachments: [],
    });
  });

  it("relays nothing for a block holding neither prose nor a file", () => {
    expect(
      relayedFrom(block({ content: { markdown: "   " } }), bytes, {
        tags: [],
        hashtags: false,
      }),
    ).toBeUndefined();
    expect(
      relayedFrom(block({ type: "Link" }), bytes, {
        tags: [],
        hashtags: false,
      }),
    ).toBeUndefined();
  });

  it("reads a file through the reader it was given, once asked, passing the block itself", async () => {
    let opened: ArenaBlock | undefined;
    const relaying = relayedFrom(
      block({
        type: "Image",
        image: {
          filename: "a.png",
          content_type: "image/png",
          src: "https://images.example.com/a.png",
        },
      }),
      (b) => {
        opened = b;
        return bytes();
      },
      { tags: [], hashtags: false },
    );

    expect(opened).toBeUndefined();
    await relaying?.attachments[0]?.open();
    expect(opened?.id).toBe(123);
  });
});
