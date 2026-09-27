import { describe, expect, it } from "vitest";

import { relayedFrom, uidOf } from "./relayed";
import type { Memo } from "./types";

const bytes = () => Promise.resolve(new TextEncoder().encode("PNG"));

function memo(overrides: Partial<Memo> = {}): Memo {
  return {
    name: "memos/abc123",
    content: "a thought, with a #kind/quote in it",
    createTime: "2026-09-04T14:23:05Z",
    updateTime: "2026-09-05T08:00:00Z",
    tags: ["kind/quote"],
    ...overrides,
  };
}

describe("a memo as the pool takes it", () => {
  it("carries its uid, its own capture time and its content verbatim", () => {
    const relaying = relayedFrom(memo(), bytes, { hashtags: false });

    expect(relaying).toEqual({
      sourceItemId: "abc123",
      version: "2026-09-05T08:00:00Z",
      capturedAt: "2026-09-04T14:23:05Z",
      text: "a thought, with a #kind/quote in it",
      tags: ["kind/quote"],
      attachments: [],
    });
  });

  it("hands the attachments over in order, under their own upstream names", () => {
    const relaying = relayedFrom(
      memo({
        attachments: [
          { name: "attachments/1", filename: "one.png", type: "image/png" },
          {
            name: "attachments/2",
            filename: "two.pdf",
            type: "application/pdf",
          },
        ],
      }),
      bytes,
      { hashtags: false },
    );

    expect(
      relaying?.attachments.map(({ id, filename, mime }) => ({
        id,
        filename,
        mime,
      })),
    ).toEqual([
      { id: "attachments/1", filename: "one.png", mime: "image/png" },
      { id: "attachments/2", filename: "two.pdf", mime: "application/pdf" },
    ]);
  });

  it("captures a memo that is only pictures, and carries no prose at all", () => {
    const relaying = relayedFrom(
      memo({
        content: "",
        tags: [],
        attachments: [
          { name: "attachments/1", filename: "one.png", type: "image/png" },
        ],
      }),
      bytes,
      { hashtags: false },
    );

    expect(relaying).toMatchObject({ tags: [] });
    expect(relaying && "text" in relaying).toBe(false);
  });

  it("takes a foot of tags off the prose where it was asked to", () => {
    const relaying = relayedFrom(
      memo({
        content: "a thought\n\n#kind/quote #read/later",
        tags: ["kind/quote", "read/later"],
      }),
      bytes,
      { hashtags: true },
    );

    expect(relaying).toMatchObject({
      text: "a thought",
      // Memos extracted both itself; the foot adds nothing here but its own
      // absence from the prose.
      tags: ["kind/quote", "read/later"],
    });
  });

  it("adds a tag Memos did not extract, after the ones it did", () => {
    const relaying = relayedFrom(
      memo({
        content: "a thought\n\n#kind/quote #topic/x",
        tags: ["kind/quote"],
      }),
      bytes,
      { hashtags: true },
    );

    expect(relaying).toMatchObject({
      text: "a thought",
      tags: ["kind/quote", "topic/x"],
    });
  });

  it("leaves the prose alone where the foot is the whole of the memo", () => {
    const relaying = relayedFrom(
      memo({ content: "#kind/quote", tags: ["kind/quote"] }),
      bytes,
      { hashtags: true },
    );

    expect(relaying).toMatchObject({
      text: "#kind/quote",
      tags: ["kind/quote"],
    });
  });

  it("versions a memo it read verbatim by the update time alone", () => {
    for (const hashtags of [false, true]) {
      expect(
        relayedFrom(memo({ content: "a thought" }), bytes, { hashtags })
          ?.version,
      ).toBe("2026-09-05T08:00:00Z");
    }
  });

  it("versions one whose words it changed by those words too, so two readings are two identities", () => {
    const footed = memo({ content: "a thought\n\n#kind/quote" });
    const verbatim = relayedFrom(footed, bytes, { hashtags: false })?.version;
    const stripped = relayedFrom(footed, bytes, { hashtags: true })?.version;

    // An edit is captured under an identity built from the version, and the
    // pool refuses one identity carrying two payloads. One reading must not
    // claim the other's.
    expect(verbatim).toBe("2026-09-05T08:00:00Z");
    expect(stripped).not.toBe(verbatim);
    expect(stripped).toMatch(/^2026-09-05T08:00:00Z\/[0-9a-f]{16}$/);

    // And the same every poll, or each one would manufacture a revision.
    expect(relayedFrom(footed, bytes, { hashtags: true })?.version).toBe(
      stripped,
    );
  });

  it("relays nothing for a memo holding neither prose nor an attachment", () => {
    expect(
      relayedFrom(memo({ content: "   " }), bytes, { hashtags: false }),
    ).toBeUndefined();
  });

  it("reads an attachment through the reader it was given, once asked", async () => {
    let opened = 0;
    const relaying = relayedFrom(
      memo({
        attachments: [
          { name: "attachments/1", filename: "one.png", type: "image/png" },
        ],
      }),
      () => {
        opened += 1;
        return bytes();
      },
      { hashtags: false },
    );

    expect(opened).toBe(0);
    await relaying?.attachments[0]?.open();
    expect(opened).toBe(1);
  });
});

describe("a memo's resource name", () => {
  it("is the uid under `memos/`", () => {
    expect(uidOf("memos/abc123")).toBe("abc123");
  });

  it("is refused where it is not one, rather than captured under an empty id", () => {
    expect(() => uidOf("abc123")).toThrow(/not a memo's resource name/);
    expect(() => uidOf("memos/")).toThrow(/not a memo's resource name/);
  });
});
