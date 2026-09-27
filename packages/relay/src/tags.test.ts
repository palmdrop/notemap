import { describe, expect, it } from "vitest";

import { classified, tagFootOf } from "./tags";

describe("the tag foot of a note", () => {
  it("is the last line where that line is tags and nothing else", () => {
    expect(tagFootOf("a thought\n\n#kind/quote")).toEqual({
      tags: ["kind/quote"],
      prose: "a thought",
    });
  });

  it("is every tag line at the end, which is how more than one line of them is written", () => {
    expect(tagFootOf("a thought\n\n#kind/quote #topic/x\n#read/later")).toEqual(
      {
        tags: ["kind/quote", "topic/x", "read/later"],
        prose: "a thought",
      },
    );
  });

  it("takes the blank lines above it with it, and leaves the prose's own alone", () => {
    expect(tagFootOf("one\n\ntwo\n\n#kind/note").prose).toBe("one\n\ntwo");
  });

  it("is nothing where the last line is prose, whatever stands further up", () => {
    expect(tagFootOf("#kind/quote\n\na thought")).toEqual({
      tags: [],
      prose: "#kind/quote\n\na thought",
    });
  });

  it("leaves a hashtag in a sentence alone: it is a word somebody wrote", () => {
    expect(tagFootOf("a thought about #quoting and why")).toEqual({
      tags: [],
      prose: "a thought about #quoting and why",
    });
  });

  it("is nothing where one token on the line is not a hashtag at all", () => {
    for (const line of [
      "#kind/quote.",
      "#kind/quote and #topic/x",
      "#ff0000;",
      "# heading",
      "#",
    ]) {
      expect(tagFootOf(`a thought\n\n${line}`)).toEqual({
        tags: [],
        prose: `a thought\n\n${line}`,
      });
    }
  });

  it("reads a hex colour or an issue number where the whole line is one", () => {
    // Nothing tells these apart from a tag, and a line of nothing else was
    // written on purpose. `#ff0000` mid-sentence is left where it is.
    expect(tagFootOf("a thought\n\n#ff0000").tags).toEqual(["ff0000"]);
  });

  it("reads a tag that is not written in ASCII", () => {
    expect(tagFootOf("en tanke\n\n#idé/citat").tags).toEqual(["idé/citat"]);
  });

  it("says the same tag once, however many times the foot spells it", () => {
    expect(tagFootOf("a\n\n#kind/note #kind/note\n#kind/note").tags).toEqual([
      "kind/note",
    ]);
  });

  it("has no prose where the foot is the whole of the text", () => {
    expect(tagFootOf("#kind/note")).toEqual({
      tags: ["kind/note"],
      prose: "",
    });
  });
});

describe("prose and tags as the pool takes them", () => {
  it("leaves both exactly as they are where the relay was not asked", () => {
    expect(classified("a thought\n\n#kind/quote", ["arena/x"], false)).toEqual({
      text: "a thought\n\n#kind/quote",
      tags: ["arena/x"],
    });
  });

  it("takes the foot off the prose and adds it after the configured tags", () => {
    expect(classified("a thought\n\n#kind/quote", ["arena/x"], true)).toEqual({
      text: "a thought",
      tags: ["arena/x", "kind/quote"],
    });
  });

  it("says a tag once where the foot spells one the relay is configured with", () => {
    expect(classified("a\n\n#arena/x #kind/note", ["arena/x"], true)).toEqual({
      text: "a",
      tags: ["arena/x", "kind/note"],
    });
  });

  it("keeps the words of a note that is only a foot, which would otherwise capture empty", () => {
    expect(classified("#kind/note", [], true)).toEqual({
      text: "#kind/note",
      tags: ["kind/note"],
    });
  });

  it("leaves a note with no foot untouched, down to the same string", () => {
    const text = "a thought about #quoting";
    expect(classified(text, [], true)).toEqual({ text, tags: [] });
  });

  it("has nothing to read where there is no prose at all", () => {
    expect(classified(undefined, ["arena/x"], true)).toEqual({
      text: undefined,
      tags: ["arena/x"],
    });
  });
});
