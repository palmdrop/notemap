import { describe, expect, it } from "vitest";

import { insertUnder } from "./sections";

describe("inserting under a heading", () => {
  it("appends at the end where no heading is named", () => {
    expect(insertUnder("the first line\n", "a thought")).toBe(
      "the first line\n\na thought\n",
    );
  });

  it("writes the heading where the note does not have it", () => {
    expect(insertUnder("# Monday\n", "a thought", "Captured")).toBe(
      "# Monday\n\n## Captured\n\na thought\n",
    );
  });

  it("writes the note itself where there is nothing there", () => {
    expect(insertUnder("", "a thought", "Captured")).toBe(
      "## Captured\n\na thought\n",
    );
  });

  it("puts the fragment at the end of the section, not the end of the note", () => {
    const note = "## Captured\n\nthe first\n\n## Later\n\nsomething else\n";

    expect(insertUnder(note, "the second", "Captured")).toBe(
      "## Captured\n\nthe first\n\nthe second\n\n## Later\n\nsomething else\n",
    );
  });

  /** A deeper heading is part of the section, so the fragment goes below it. */
  it("passes over a heading deeper than the one it was given", () => {
    const note = "## Captured\n\n### A morning\n\nthe first\n\n## Later\n\nlast\n";

    expect(insertUnder(note, "the second", "Captured")).toBe(
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

    const written = insertUnder(note, "the second", "Captured");

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

    expect(insertUnder(note, "a thought", "Captured")).toBe(
      ["```sh", "## Captured", "```", "", "## Captured", "", "a thought", ""].join(
        "\n",
      ),
    );
  });

  /** Setext headings are headings, which a `#`-only regex never saw. */
  it("finds a heading written with underlining", () => {
    const note = "Captured\n========\n\nthe first\n";

    expect(insertUnder(note, "the second", "Captured")).toBe(
      "Captured\n========\n\nthe first\n\nthe second\n",
    );
  });

  it("matches the heading a person typed, not what its emphasis parsed to", () => {
    const note = "## Read: *Borges*\n\nthe first\n";

    expect(insertUnder(note, "the second", "Read: *Borges*")).toBe(
      "## Read: *Borges*\n\nthe first\n\nthe second\n",
    );
  });
});
