import { describe, expect, it } from "vitest";

import { insertUnder } from "./sections";

const filed = (...args: Parameters<typeof insertUnder>): string =>
  insertUnder(...args).file;

describe("inserting under a heading", () => {
  it("appends at the end where no heading is named", () => {
    expect(filed("the first line\n", "a thought")).toBe(
      "the first line\n\na thought\n",
    );
  });

  it("is the fragment alone where the note holds nothing but whitespace", () => {
    expect(filed("", "a thought")).toBe("a thought\n");
    expect(filed("  \n\n", "a thought")).toBe("a thought\n");
  });

  it("finds the heading whatever case it was typed in", () => {
    expect(filed("## Next\n\n- a\n", "- b", "next")).toBe(
      "## Next\n\n- a\n- b\n",
    );
  });

  it("files under the first of two headings that differ only by case", () => {
    expect(filed("## Next\n\none\n\n## NEXT\n\ntwo\n", "three", "NEXT")).toBe(
      "## Next\n\none\n\nthree\n\n## NEXT\n\ntwo\n",
    );
  });

  it("writes the heading where the note does not have it", () => {
    expect(filed("# Monday\n", "a thought", "Captured")).toBe(
      "# Monday\n\n## Captured\n\na thought\n",
    );
  });

  it("writes the note itself where there is nothing there", () => {
    expect(filed("", "a thought", "Captured")).toBe(
      "## Captured\n\na thought\n",
    );
  });

  it("puts the fragment at the end of the section, not the end of the note", () => {
    const note = "## Captured\n\nthe first\n\n## Later\n\nsomething else\n";

    expect(filed(note, "the second", "Captured")).toBe(
      "## Captured\n\nthe first\n\nthe second\n\n## Later\n\nsomething else\n",
    );
  });

  /** A deeper heading is part of the section, so the fragment goes below it. */
  it("passes over a heading deeper than the one it was given", () => {
    const note =
      "## Captured\n\n### A morning\n\nthe first\n\n## Later\n\nlast\n";

    expect(filed(note, "the second", "Captured")).toBe(
      "## Captured\n\n### A morning\n\nthe first\n\nthe second\n\n## Later\n\nlast\n",
    );
  });

  /**
   * The reason this reads a parse rather than the lines. `# install deps` in a
   * shell block is not a heading, and a line-walker ended the section at it —
   * which put the fragment inside somebody's code fence.
   */
  it("does not mistake a comment in a code fence for a heading", () => {
    const note = [
      "## Captured",
      "",
      "```sh",
      "# install deps",
      "pnpm install",
      "```",
      "",
      "## Later",
      "",
      "last",
      "",
    ].join("\n");

    const written = filed(note, "the second", "Captured");

    expect(written).toBe(
      [
        "## Captured",
        "",
        "```sh",
        "# install deps",
        "pnpm install",
        "```",
        "",
        "the second",
        "",
        "## Later",
        "",
        "last",
        "",
      ].join("\n"),
    );
  });

  /** Nor for the heading itself: a fence is not where a section starts. */
  it("does not find its heading inside a code fence", () => {
    const note = ["```sh", "## Captured", "```", ""].join("\n");

    expect(filed(note, "a thought", "Captured")).toBe(
      [
        "```sh",
        "## Captured",
        "```",
        "",
        "## Captured",
        "",
        "a thought",
        "",
      ].join("\n"),
    );
  });

  /** Setext headings are headings, which a `#`-only regex never saw. */
  it("finds a heading written with underlining", () => {
    const note = "Captured\n========\n\nthe first\n";

    expect(filed(note, "the second", "Captured")).toBe(
      "Captured\n========\n\nthe first\n\nthe second\n",
    );
  });

  it("matches the heading a person typed, not what its emphasis parsed to", () => {
    const note = "## Read: *Borges*\n\nthe first\n";

    expect(filed(note, "the second", "Read: *Borges*")).toBe(
      "## Read: *Borges*\n\nthe first\n\nthe second\n",
    );
  });
});

describe("an item joining a list", () => {
  it("keeps a tight list tight", () => {
    expect(
      filed(
        "## Todo\n\n- [ ] one\n- [ ] two\n\n## Later\n\nprose\n",
        "- [ ] three\n",
        "Todo",
      ),
    ).toBe(
      "## Todo\n\n- [ ] one\n- [ ] two\n- [ ] three\n\n## Later\n\nprose\n",
    );
  });

  it("keeps a loose list loose", () => {
    expect(filed("## Todo\n\n- one\n\n- two\n", "- three\n", "Todo")).toBe(
      "## Todo\n\n- one\n\n- two\n\n- three\n",
    );
  });

  it("joins the list at the end of a note where no heading is named", () => {
    expect(filed("- one\n- two\n", "- three\n")).toBe(
      "- one\n- two\n- three\n",
    );
  });

  it("starts a list of its own after a section ending in prose", () => {
    expect(filed("## Todo\n\nsome words\n", "- one\n", "Todo")).toBe(
      "## Todo\n\nsome words\n\n- one\n",
    );
  });

  it("does not take a list inside a fence for a list", () => {
    expect(filed("## Todo\n\n```md\n- one\n```\n", "- two\n", "Todo")).toBe(
      "## Todo\n\n```md\n- one\n```\n\n- two\n",
    );
  });

  it("leaves a block after a list as it always was", () => {
    expect(filed("## Notes\n\n- one\n", "a thought\n", "Notes")).toBe(
      "## Notes\n\n- one\n\na thought\n",
    );
  });

  it("joins a list written with another bullet by taking its bullet", () => {
    expect(
      insertUnder("## Todo\n\n* one\n* two\n", "- [ ] three\n  more\n", "Todo"),
    ).toEqual({
      file: "## Todo\n\n* one\n* two\n* [ ] three\n  more\n",
      inserted: "* [ ] three\n  more\n",
    });
  });

  it("leaves the bullets of a list nested in the item alone", () => {
    expect(insertUnder("+ one\n", "- two\n  - under two\n").inserted).toBe(
      "+ two\n  - under two\n",
    );
  });

  it("starts a list of its own after a numbered one", () => {
    expect(
      insertUnder("## Todo\n\n1. one\n2. two\n", "- three\n", "Todo"),
    ).toEqual({
      file: "## Todo\n\n1. one\n2. two\n\n- three\n",
      inserted: "- three\n",
    });
  });

  it("says the fragment went in as it was, wherever no list is joined", () => {
    expect(
      insertUnder("## Notes\n\nwords\n", "- one\n", "Notes").inserted,
    ).toBe("- one\n");
    expect(insertUnder("", "- one\n", "Notes").inserted).toBe("- one\n");
  });

  it("joins a list that keeps going after a nested one", () => {
    expect(filed("## Todo\n\n- one\n  - under one\n", "- two\n", "Todo")).toBe(
      "## Todo\n\n- one\n  - under one\n- two\n",
    );
  });
});
