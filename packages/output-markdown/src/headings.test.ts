import { describe, expect, it } from "vitest";

import type { CandidatesRequest, CapabilityName } from "@notemap/core";

import { headingCandidates, headingsNote } from "./headings";
import { insertUnder } from "./sections";

describe("the headings a note offers", () => {
  it("lists each in the order the note holds them, with its level in the label", () => {
    expect(
      headingCandidates("# Todo\n\n## Templates\n\n### Later\n").entries,
    ).toEqual([
      { label: "# Todo", value: "Todo" },
      { label: "## Templates", value: "Templates" },
      { label: "### Later", value: "Later" },
    ]);
  });

  /** The cap, and the first heading past it: a browse says it was cut rather than lying. */
  it("offers the cap in full, and says so where the note holds one more", () => {
    const upTo = (count: number) =>
      Array.from({ length: count }, (_, each) => `# h${each}\n`).join("\n");

    const capped = headingCandidates(upTo(500));
    expect(capped.truncated).toBe(false);
    expect(capped.entries).toHaveLength(500);

    const over = headingCandidates(upTo(501));
    expect(over.truncated).toBe(true);
    expect(over.entries).toHaveLength(500);
    expect(over.entries.at(-1)).toEqual({ label: "# h499", value: "h499" });
  });

  it("reads an underlined heading and keeps the emphasis a person typed", () => {
    expect(
      headingCandidates("Reading\n=======\n\n## Read: *Borges*\n").entries,
    ).toEqual([
      { label: "# Reading", value: "Reading" },
      { label: "## Read: *Borges*", value: "Read: *Borges*" },
    ]);
  });

  it("reads a closed heading as what it says, without its closing hashes", () => {
    expect(headingCandidates("## Monday ##\n").entries).toEqual([
      { label: "## Monday", value: "Monday" },
    ]);
  });

  it("leaves out a heading that is nothing but its hashes", () => {
    expect(headingCandidates("#\n\n## Monday\n").entries).toEqual([
      { label: "## Monday", value: "Monday" },
    ]);
  });

  it("does not take a comment in a code fence for a heading", () => {
    expect(
      headingCandidates("## Setup\n\n```sh\n# install deps\n```\n").entries,
    ).toEqual([{ label: "## Setup", value: "Setup" }]);
  });

  it("lists a heading the note holds twice once, since only the first is ever filed under", () => {
    expect(
      headingCandidates("## Notes\n\none\n\n## Notes\n\ntwo\n").entries,
    ).toEqual([{ label: "## Notes", value: "Notes" }]);
  });

  it("lists headings that differ only by case once, as the first spells it", () => {
    expect(
      headingCandidates("## Next\n\none\n\n## NEXT\n\ntwo\n").entries,
    ).toEqual([{ label: "## Next", value: "Next" }]);
  });

  it("offers only what the splice will find", () => {
    const note = "# Monday\n\n## Read: *Borges*\n\n## Later\n";
    for (const entry of headingCandidates(note).entries) {
      const { file: filed } = insertUnder(
        note,
        "marker\n",
        String(entry.value),
      );
      expect(filed.match(/^## /gm)?.length).toBe(2);
      expect(filed).toContain("marker");
    }
  });
});

describe("which note a heading browse is about", () => {
  const request = (path?: string): CandidatesRequest => ({
    capability: "append" as CapabilityName,
    field: "heading",
    ...(path === undefined ? {} : { given: { path } }),
  });

  it("is the note its path names", () => {
    expect(headingsNote(request("projects/todo.md"))).toBe("projects/todo.md");
  });

  it("is none for a folder, whose filename is derived at delivery, or for no path", () => {
    expect(headingsNote(request("projects/"))).toBeUndefined();
    expect(headingsNote(request(""))).toBeUndefined();
    expect(headingsNote(request())).toBeUndefined();
  });
});
