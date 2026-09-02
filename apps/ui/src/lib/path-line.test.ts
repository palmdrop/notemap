import type { CandidateEntry } from "@notemap/client";
import { describe, expect, test } from "vitest";

import {
  completionOf,
  matching,
  parsePath,
  popped,
  reachable,
  rowsOf,
  scopesAlong,
  textOf,
  withTyping,
  type Level,
} from "./path-line";

const folder = (label: string, scope: string): CandidateEntry => ({
  label,
  scope,
});

const file = (label: string, value: string): CandidateEntry => ({
  label,
  value,
});

describe("reading the line", () => {
  test("splits a path at its last slash", () => {
    expect(parsePath("projects/notemap/dra")).toEqual({
      complete: ["projects", "notemap"],
      typing: "dra",
      folder: false,
    });
  });

  test("reads a trailing slash as a folder with nothing typed after it", () => {
    expect(parsePath("projects/notemap/")).toEqual({
      complete: ["projects", "notemap"],
      typing: "",
      folder: true,
    });
  });

  test("reads an empty line as the root", () => {
    expect(parsePath("")).toEqual({ complete: [], typing: "", folder: true });
  });

  test("names one scope per level along the path, the root first", () => {
    expect(scopesAlong(parsePath("projects/notemap/dra"))).toEqual([
      "",
      "projects",
      "projects/notemap",
    ]);
  });

  test("asks about no deeper scope than the path has settled", () => {
    expect(scopesAlong(parsePath("pro"))).toEqual([""]);
  });
});

describe("what a folder adds", () => {
  test("carries its own slash, so typing continues past it", () => {
    expect(textOf(folder("drafts", "drafts"))).toBe("drafts/");
    expect(textOf(file("a.md", "a.md"))).toBe("a.md");
  });
});

describe("filtering a scope", () => {
  const entries = [
    folder("projects", "projects"),
    folder("journal", "journal"),
    file("Proposal.md", "Proposal.md"),
  ];

  test("narrows to what the typed text begins", () => {
    expect(matching(entries, "pro").map((each) => each.label)).toEqual([
      "projects",
      "Proposal.md",
    ]);
  });

  test("keeps everything where nothing is typed", () => {
    expect(matching(entries, "")).toHaveLength(3);
  });

  test("matches by prefix rather than anywhere in the name", () => {
    expect(matching(entries, "ject")).toEqual([]);
  });
});

describe("completing a segment", () => {
  test("finishes the only match, slash and all", () => {
    expect(completionOf([folder("projects", "projects")], "pro")).toBe(
      "projects/",
    );
  });

  test("goes only as far as several matches agree", () => {
    expect(
      completionOf(
        [folder("projects", "projects"), folder("promises", "promises")],
        "p",
      ),
    ).toBe("pro");
  });

  test("adds nothing where the name is already whole", () => {
    expect(
      completionOf([folder("projects", "projects")], "projects/"),
    ).toBeUndefined();
  });

  test("adds nothing where nothing matches", () => {
    expect(completionOf([folder("a", "a")], "zzz")).toBeUndefined();
  });

  test("adds nothing where the matches share no more than what is typed", () => {
    expect(
      completionOf([folder("ab", "ab"), folder("ac", "ac")], "a"),
    ).toBeUndefined();
  });
});

describe("popping a segment", () => {
  test("takes the whole level rather than one character of it", () => {
    expect(popped("projects/notemap/")).toBe("projects/");
    expect(popped("projects/")).toBe("");
  });

  test("leaves an empty line alone", () => {
    expect(popped("")).toBe("");
  });
});

describe("putting a completion back in the line", () => {
  test("keeps everything settled before it", () => {
    expect(withTyping(parsePath("projects/no"), "notemap/")).toBe(
      "projects/notemap/",
    );
  });

  test("takes the whole line where nothing is settled", () => {
    expect(withTyping(parsePath("pro"), "projects/")).toBe("projects/");
  });
});

describe("the hierarchy as it is drawn", () => {
  const levels: Level[] = [
    {
      scope: "",
      entries: [
        folder("journal", "journal"),
        folder("projects", "projects"),
        folder("reading", "reading"),
      ],
    },
    {
      scope: "projects",
      entries: [
        folder("kontradiktion", "projects/kontradiktion"),
        folder("notemap", "projects/notemap"),
      ],
    },
    {
      scope: "projects/notemap",
      entries: [
        folder("notes", "projects/notemap/notes"),
        file("readme.md", "projects/notemap/readme.md"),
      ],
    },
  ];

  test("draws each level under the ancestor the path took", () => {
    const rows = rowsOf(levels, parsePath("projects/notemap/"));

    expect(
      rows.map((row) => `${" ".repeat(row.depth)}${textOf(row.entry)}`),
    ).toEqual([
      "journal/",
      "projects/",
      " kontradiktion/",
      " notemap/",
      "  notes/",
      "  readme.md",
      "reading/",
    ]);
  });

  test("shows every level's siblings, so the tree is shown and not walked", () => {
    const rows = rowsOf(levels, parsePath("projects/notemap/"));

    expect(rows.map((row) => row.entry.label)).toContain("kontradiktion");
    expect(rows.map((row) => row.entry.label)).toContain("journal");
  });

  test("marks the segment the path took at each level", () => {
    const rows = rowsOf(levels, parsePath("projects/notemap/"));
    const trail = rows
      .filter((row) => row.onPath)
      .map((row) => row.entry.label);

    expect(trail).toEqual(["projects", "notemap"]);
  });

  test("filters the deepest level alone", () => {
    const rows = rowsOf(levels, parsePath("projects/notemap/no"));

    expect(
      rows.filter((row) => row.here).map((row) => row.entry.label),
    ).toEqual(["notes"]);
    expect(rows.map((row) => row.entry.label)).toContain("journal");
  });

  test("moves through the deepest level alone", () => {
    const rows = rowsOf(levels, parsePath("projects/notemap/"));

    expect(reachable(rows).map((row) => row.entry.label)).toEqual([
      "notes",
      "readme.md",
    ]);
  });

  /** A folder still being typed does not exist, and the tree stops at what does. */
  test("stops at the deepest level that answered", () => {
    const rows = rowsOf(
      [levels[0] as Level, levels[1] as Level, { scope: "projects/nope" }],
      parsePath("projects/nope/"),
    );

    expect(reachable(rows).map((row) => row.entry.label)).toEqual([
      "kontradiktion",
      "notemap",
    ]);
  });

  test("draws nothing at all where the root itself answered nothing", () => {
    expect(rowsOf([{ scope: "" }], parsePath(""))).toEqual([]);
  });
});
