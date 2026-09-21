import { fixedFrontmatter } from "@notemap/output-markdown";
import { describe, expect, it } from "vitest";

import { arenaRenderers, droppedBy, provenanceOf, renderNote } from "./blocks";
import { delivery, deliveredAsset, bytes, NOTE } from "./testing/fixture";

const said = (text: string) => renderNote(delivery({ content: { text } }));

/**
 * The one judgement this adapter makes at delivery: are.na infers Link, Image or
 * Embed from the value itself, so what goes in `value` decides what the block
 * becomes.
 */
describe("where the prose ends and the link begins", () => {
  it("sends a bare URL as the value, so the block is a link", () => {
    expect(said("https://example.com/a")).toEqual({
      value: "https://example.com/a",
    });
  });

  it("keeps the prose under it as the caption", () => {
    expect(said("https://example.com/a\n\nwhy it matters")).toEqual({
      value: "https://example.com/a",
      description: "why it matters",
    });
  });

  it("is prose where the URL shares its line with anything else", () => {
    const text = "see https://example.com/a for the argument";
    expect(said(text)).toEqual({ value: text });
  });

  it("is prose where the first line is not a URL at all", () => {
    expect(said("a thought\n\nhttps://example.com/a")).toEqual({
      value: "a thought\n\nhttps://example.com/a",
    });
  });

  /** A `file:` or a `mailto:` is not something are.na can fetch. */
  it("is prose where the scheme is not one a browser follows", () => {
    expect(said("file:///etc/passwd")).toEqual({ value: "file:///etc/passwd" });
  });

  it("carries a capture with nothing in it as an empty value", () => {
    expect(renderNote(delivery({ content: {} }))).toEqual({ value: "" });
  });
});

describe("a capture carrying an asset", () => {
  it("names the slot rather than a value, and captions it twice", () => {
    const asset = deliveredAsset("main", "mum.png", bytes("png"));
    const each = delivery({ content: { text: "mum, 1994" }, assets: [asset] });

    expect(renderNote(each)).toEqual({
      value: "",
      description: "mum, 1994",
      altText: "mum, 1994",
      asset: { slot: "main" },
    });
  });

  it("says nothing about it where the capture said nothing", () => {
    const asset = deliveredAsset("main", "mum.png", bytes("png"));

    expect(renderNote(delivery({ content: {}, assets: [asset] }))).toEqual({
      value: "",
      asset: { slot: "main" },
    });
  });
});

describe("what the block remembers about where it came from", () => {
  /** The words a note's frontmatter uses, so one item says it one way wherever it lands. */
  it("carries the item, the source and the capture time", () => {
    expect(provenanceOf(delivery())).toMatchObject({
      id: "item-1",
      capture_source: "scratchpad",
      captured_at: "2026-09-08T14:23:05.000Z",
      derived_from: "urn:commons:item:item-1",
    });
  });

  it("says it in the same words a note's frontmatter does", () => {
    const written = Object.keys(
      provenanceOf(delivery({ tags: ["one"] })) ?? {},
    );

    expect(written).toEqual(
      [...fixedFrontmatter(delivery({ tags: ["one"] }), ["one"])].map(
        ([key]) => key,
      ),
    );
  });

  /** One key: a capture may carry more tags than the whole object is allowed keys. */
  it("flattens the tags into one joined string", () => {
    expect(
      provenanceOf(delivery({ tags: ["kind/quote", "project/fiction-a"] })),
    ).toMatchObject({ tags: "kind/quote, project/fiction-a" });
  });

  it("writes keys are.na will take, and no more than it will take", () => {
    const written = provenanceOf(delivery({ tags: ["one"] })) ?? {};

    expect(Object.keys(written).length).toBeLessThanOrEqual(50);
    for (const [key, value] of Object.entries(written)) {
      expect(key).toMatch(/^[A-Za-z0-9_]{1,40}$/);
      expect(value.length).toBeLessThanOrEqual(2000);
    }
  });
});

describe("what a block could not carry", () => {
  it("says nothing where there was nothing to drop", () => {
    expect(droppedBy(delivery())).toBeUndefined();
  });

  it("names the tags where there were any", () => {
    expect(droppedBy(delivery({ tags: ["kind/quote"] }))).toContain("its tags");
  });
});

/** `accepts` is derived from these, so a type with no block form is refused by core. */
it("offers a renderer for the one payload type there is", () => {
  expect(Object.keys(arenaRenderers())).toEqual([NOTE]);
});
