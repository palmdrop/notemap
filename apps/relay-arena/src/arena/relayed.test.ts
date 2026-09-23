import { describe, expect, it } from "vitest";

import { relayedFrom } from "./relayed";
import type { ArenaBlock } from "./types";

const bytes = () => Promise.resolve(new TextEncoder().encode("BYTES"));

function block(overrides: Partial<ArenaBlock> = {}): ArenaBlock {
  return {
    id: 123,
    type: "Text",
    updated_at: "2026-09-05T08:00:00Z",
    connection: { connected_at: "2026-09-04T14:23:05Z" },
    ...overrides,
  };
}

describe("a block as the pool takes it", () => {
  it("carries a Text block's prose verbatim, and connected_at as capturedAt", () => {
    const relaying = relayedFrom(
      block({ content: { markdown: "a thought" } }),
      bytes,
      [],
    );

    expect(relaying).toEqual({
      sourceItemId: "123",
      version: "2026-09-05T08:00:00Z",
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
      ["arena/influences"],
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
      [],
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
      [],
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
      [],
    );

    expect(relaying).toMatchObject({
      attachments: [
        { id: "block/123/image", filename: "a.pdf", mime: "application/pdf" },
      ],
    });
    expect(relaying && "text" in relaying).toBe(false);
  });

  it("relays nothing for a Channel block: a channel connected into a channel is not a note", () => {
    expect(relayedFrom(block({ type: "Channel" }), bytes, [])).toBeUndefined();
  });

  it("relays nothing for a block holding neither prose nor a file", () => {
    expect(
      relayedFrom(block({ content: { markdown: "   " } }), bytes, []),
    ).toBeUndefined();
    expect(relayedFrom(block({ type: "Link" }), bytes, [])).toBeUndefined();
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
      [],
    );

    expect(opened).toBeUndefined();
    await relaying?.attachments[0]?.open();
    expect(opened?.id).toBe(123);
  });
});
