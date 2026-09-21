import { describe, expect, it } from "vitest";

import type { Tag, TagName, Timestamp } from "@notemap/core";

import {
  carriedTags,
  hashtagsFor,
  tagsModeOf,
  tagsSettingOf,
  triggerTagsOf,
} from "./tags";

const held = (...names: string[]): Tag[] =>
  names.map((name) => ({
    name: name as TagName,
    by: { kind: "person" as const },
    addedAt: "2026-09-10T09:00:00.000Z" as Timestamp,
  }));

describe("where a note's tags go", () => {
  it("inherits the destination's setting where the arguments say nothing", () => {
    expect(tagsModeOf({}, "hashtags")).toBe("hashtags");
  });

  it("lets one capture override the destination", () => {
    expect(tagsModeOf({ tags: "none" }, "hashtags")).toBe("none");
  });

  it("is the frontmatter where neither said, which is where they went before", () => {
    expect(tagsModeOf({})).toBe("frontmatter");
  });

  it("reads a setting rather than trusting one", () => {
    expect(tagsSettingOf({ tags: "hashtags" })).toBe("hashtags");
    expect(tagsSettingOf({ tags: "somewhere" })).toBeUndefined();
    expect(tagsSettingOf({})).toBeUndefined();
  });
});

describe("tags as hashtags", () => {
  it("writes them on one line, in the order they arrived", () => {
    expect(hashtagsFor(["quote", "project/fiction-a"]).line).toBe(
      "#quote #project/fiction-a",
    );
  });

  /** A space ends a hashtag, so the tag after it would be read as prose. */
  it("leaves out a tag no hashtag can be made of, and names it", () => {
    const written = hashtagsFor(["quote", "a loose thought"]);

    expect(written.line).toBe("#quote");
    expect(written.unwritable).toEqual(["a loose thought"]);
  });

  it("answers an empty line where none of them could be written", () => {
    expect(hashtagsFor(["a loose thought"]).line).toBe("");
  });

  it("rewrites nothing: a tag is somebody's word for something", () => {
    expect(hashtagsFor(["a loose thought"]).unwritable).toEqual([
      "a loose thought",
    ]);
  });
});

describe("whether the tags that filed the item go with it", () => {
  it("is no unless the arguments say yes, and only `true` says it", () => {
    expect(triggerTagsOf({})).toBe(false);
    expect(triggerTagsOf({ triggerTags: "true" })).toBe(false);
    expect(triggerTagsOf({ triggerTags: true })).toBe(true);
  });

  it("leaves every tag under `route/` behind by default, keeping the order", () => {
    expect(
      carriedTags(held("route/research", "quote", "route/journal", "b"), false),
    ).toEqual(["quote", "b"]);
  });

  it("carries them all where asked", () => {
    expect(carriedTags(held("route/research", "quote"), true)).toEqual([
      "route/research",
      "quote",
    ]);
  });
});
