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

  it("reads an underlined heading and keeps the emphasis a person typed", () => {
    expect(
      headingCandidates("Reading\n=======\n\n## Read: *Borges*\n").entries,
    ).toEqual([
      { label: "# Reading", value: "Reading" },
      { label: "## Read: *Borges*", value: "Read: *Borges*" },
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
