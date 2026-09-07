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
    const relaying = relayedFrom(memo(), bytes);

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
    );

    expect(relaying).toMatchObject({ tags: [] });
    expect(relaying && "text" in relaying).toBe(false);
  });

  it("relays nothing for a memo holding neither prose nor an attachment", () => {
    expect(relayedFrom(memo({ content: "   " }), bytes)).toBeUndefined();
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
