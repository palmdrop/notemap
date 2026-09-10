import { describe, expect, it } from "vitest";

import { hashtagsFor, tagsModeOf, tagsSettingOf } from "./tags";

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
