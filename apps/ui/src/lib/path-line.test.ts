import type { CandidateEntry } from "@notemap/client";
import { describe, expect, test } from "vitest";

import {
  completionOf,
  continuing,
  ghostFor,
  marked,
  ranked,
  matching,
  landedOn,
  levelAt,
  parsePath,
  pathOf,
  pending,
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

  test("finds a name by what falls in the middle of it", () => {
    expect(matching(entries, "ject").map((each) => each.label)).toEqual([
      "projects",
    ]);
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

  test("leaves a shared head that does not continue what was typed", () => {
    expect(
      completionOf(
        [folder("daily-a", "daily-a"), folder("daily-b", "daily-b")],
        "ily",
      ),
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

  test("narrows the level the caret is in, and leaves the rest whole", () => {
    const rows = rowsOf(levels, parsePath("projects/notemap/no"));
    const drawn = rows.map((row) => row.entry.label);

    expect(drawn.filter((label) => label === "readme.md")).toEqual([]);
    expect(drawn).toContain("notes");
    expect(drawn).toContain("journal");
    expect(drawn).toContain("kontradiktion");
  });

  /**
   * Every one that is drawn, in the order it is drawn: the tree is shown rather
   * than walked, and a keyboard reaching less of it than the pointer would make
   * them two different trees.
   */
  test("moves through everything the tree drew", () => {
    const rows = rowsOf(levels, parsePath("projects/notemap/"));

    expect(reachable(rows).map((row) => row.entry.label)).toEqual([
      "journal",
      "projects",
      "kontradiktion",
      "notemap",
      "notes",
      "readme.md",
      "reading",
    ]);
  });

  /** A folder still being typed does not exist, and the tree stops at what does. */
  test("stops at the deepest level that answered", () => {
    const rows = rowsOf(
      [levels[0] as Level, levels[1] as Level, { scope: "projects/nope" }],
      parsePath("projects/nope/"),
    );

    expect(rows.map((row) => row.entry.label)).toEqual([
      "journal",
      "projects",
      "kontradiktion",
      "notemap",
      "reading",
    ]);
  });

  test("draws nothing at all where the root itself answered nothing", () => {
    expect(rowsOf([{ scope: "" }], parsePath(""))).toEqual([]);
  });
});

describe("which level the typed text filters", () => {
  const VAULT: Level[] = [
    {
      scope: "",
      entries: [folder("journal", "journal"), folder("projects", "projects")],
    },
    {
      scope: "projects",
      entries: [folder("notemap", "projects/notemap")],
    },
    {
      scope: "projects/notemap",
      entries: [
        folder("notes", "projects/notemap/notes"),
        file("readme.md", "projects/notemap/readme.md"),
      ],
    },
  ];

  /**
   * The folder is not there, so its level never answered. Matching the note
   * being typed against the folder *above* empties the trail exactly where the
   * context is needed most — while a folder is being made.
   */
  test("leaves every level whole where the caret's own has not answered", () => {
    const path = parsePath("projects/notemap/drafts/picker.md");
    const levels = [...VAULT, { scope: "projects/notemap/drafts" }];

    expect(
      rowsOf(levels, path).map((row) => [row.entry.label, row.depth]),
    ).toEqual([
      ["journal", 0],
      ["projects", 0],
      ["notemap", 1],
      ["notes", 2],
      ["readme.md", 2],
    ]);
  });

  test("filters the caret's own level, and no other", () => {
    const path = parsePath("projects/notemap/re");

    expect(rowsOf(VAULT, path).map((row) => row.entry.label)).toEqual([
      "journal",
      "projects",
      "notemap",
      "readme.md",
    ]);
  });

  /** `⇥` completes from the folder the caret is in, never the one above it. */
  test("names the caret's own level, answered or not", () => {
    expect(levelAt(VAULT, parsePath("projects/notemap/re"))?.scope).toBe(
      "projects/notemap",
    );
    expect(
      levelAt(VAULT, parsePath("projects/notemap/drafts/pi")),
    ).toBeUndefined();
    expect(levelAt(VAULT, parsePath("jour"))?.scope).toBe("");
  });
});

describe("taking an entry the tree drew", () => {
  test("drills the line down to a folder, wherever in the tree it sits", () => {
    expect(pathOf(folder("kontradiktion", "projects/kontradiktion"))).toBe(
      "projects/kontradiktion/",
    );
  });

  test("sets the line to a note, so what happens next is an append", () => {
    expect(pathOf(file("readme.md", "projects/notemap/readme.md"))).toBe(
      "projects/notemap/readme.md",
    );
  });

  /** The whole point: a sibling three levels up is not a segment of what is typed. */
  test("replaces the typed path rather than appending to it", () => {
    const deep = parsePath("projects/notemap/notes/");

    expect(withTyping(deep, textOf(folder("journal", "journal")))).toBe(
      "projects/notemap/notes/journal/",
    );
    expect(pathOf(folder("journal", "journal"))).toBe("journal/");
  });

  test("takes a folder at the root without a leading slash", () => {
    expect(pathOf(folder("journal", "journal"))).toBe("journal/");
  });
});

describe("the path that is not there yet", () => {
  test("draws the folders to be made under the deepest one that is", () => {
    const path = parsePath("projects/notemap/drafts/deep/picker.md");

    expect(
      pending(path, ["drafts", "deep"], "picker.md").map((row) => [
        row.entry.label,
        row.depth,
        row.made,
      ]),
    ).toEqual([
      ["drafts", 2, true],
      ["deep", 3, true],
      ["picker.md", 4, true],
    ]);
  });

  test("draws the note alone where every folder along the path is there", () => {
    expect(
      pending(parsePath("projects/a.md"), [], "a.md").map((row) => row.depth),
    ).toEqual([1]);
  });

  /** They are not entries the destination offered, so nothing may land on one. */
  test("puts none of them where the arrow keys reach", () => {
    const rows = pending(parsePath("drafts/a.md"), ["drafts"], "a.md");

    expect(reachable(rows)).toEqual([]);
  });

  const VAULT: Level[] = [
    {
      scope: "",
      entries: [folder("projects", "projects"), folder("reading", "reading")],
    },
    {
      scope: "projects",
      entries: [folder("notemap", "projects/notemap")],
    },
    {
      scope: "projects/notemap",
      entries: [
        folder("notes", "projects/notemap/notes"),
        file("readme.md", "projects/notemap/readme.md"),
      ],
    },
  ];

  /**
   * The bug this is here for: appended after the walk, the tail lands past
   * `reading/` and reads as a note about to be made inside it.
   */
  test("draws the tail where the trail runs out, not after the whole tree", () => {
    const path = parsePath("projects/notemap/drafts/picker.md");
    const levels = [...VAULT, { scope: "projects/notemap/drafts" }];

    expect(
      rowsOf(levels, path, pending(path, ["drafts"], "picker.md")).map(
        (row) => [textOf(row.entry), row.depth],
      ),
    ).toEqual([
      ["projects/", 0],
      ["notemap/", 1],
      ["notes/", 2],
      ["readme.md", 2],
      ["drafts/", 2],
      ["picker.md", 3],
      ["reading/", 0],
    ]);
  });

  test("draws a note under the folder that holds it, above that folder's siblings", () => {
    const path = parsePath("projects/notemap/");

    expect(
      rowsOf(VAULT, path, pending(path, [], "picker.md")).map((row) => [
        textOf(row.entry),
        row.depth,
      ]),
    ).toEqual([
      ["projects/", 0],
      ["notemap/", 1],
      ["notes/", 2],
      ["readme.md", 2],
      ["picker.md", 2],
      ["reading/", 0],
    ]);
  });

  test("leaves the tree alone where there is nothing to make", () => {
    const path = parsePath("projects/notemap/");

    expect(rowsOf(VAULT, path)).toEqual(rowsOf(VAULT, path, []));
  });

  /**
   * Appending, the file is one the tree is already drawing. A `+` beneath it
   * says a second one is about to be made, which is the opposite of what
   * committing would do.
   */
  test("draws no note where the one it lands on is already there", () => {
    const path = parsePath("projects/notemap/readme.md");

    expect(pending(path, [])).toEqual([]);
    expect(
      rowsOf(VAULT, path, pending(path, [])).map((row) => [
        textOf(row.entry),
        row.made,
      ]),
    ).toEqual([
      ["projects/", undefined],
      ["notemap/", undefined],
      ["readme.md", undefined],
      ["reading/", undefined],
    ]);
  });

  test("marks the file it lands on as the one the line holds", () => {
    const path = parsePath("projects/notemap/readme.md");
    const rows = landedOn(rowsOf(VAULT, path), path, "readme.md");

    expect(
      rows.filter((row) => row.held === true).map((row) => row.entry.label),
    ).toEqual(["readme.md"]);
    // Still takeable: it is the destination's own entry, not a promise.
    expect(reachable(rows).map((row) => row.entry.label)).toContain(
      "readme.md",
    );
  });

  /** A folder sharing the name is not where a note lands. */
  test("marks nothing where the name at that depth is a folder", () => {
    const path = parsePath("projects/notemap/notes");

    expect(
      landedOn(rowsOf(VAULT, path), path, "notes").some(
        (row) => row.held === true,
      ),
    ).toBe(false);
  });
});

describe("places used before", () => {
  const place = (value: string, uses: number, lastAt: string) => ({
    value,
    uses,
    lastAt,
  });

  test("ranks a place used more above one used later", () => {
    const order = ranked(
      marked(
        [
          place("journal/", 6, "2026-09-02T10:00:00.000Z"),
          place("notes/", 41, "2026-08-01T10:00:00.000Z"),
        ],
        [],
      ),
    ).map((each) => each.value);

    expect(order).toEqual(["notes/", "journal/"]);
  });

  test("breaks a tie on how recent the last one was", () => {
    const order = ranked(
      marked(
        [
          place("a/", 3, "2026-08-01T10:00:00.000Z"),
          place("b/", 3, "2026-09-02T10:00:00.000Z"),
        ],
        [],
      ),
    ).map((each) => each.value);

    expect(order).toEqual(["b/", "a/"]);
  });

  test("marks a place the listing does not hold as gone", () => {
    const levels: Level[] = [
      { scope: "", entries: [folder("journal", "journal")] },
    ];

    expect(
      marked([place("drafts", 12, "2026-09-01T10:00:00.000Z")], levels),
    ).toEqual([
      {
        value: "drafts",
        uses: 12,
        lastAt: "2026-09-01T10:00:00.000Z",
        gone: true,
      },
    ]);
  });

  test("marks a place the listing does hold as still there", () => {
    const levels: Level[] = [
      { scope: "", entries: [folder("journal", "journal")] },
    ];

    expect(
      marked([place("journal", 12, "2026-09-01T10:00:00.000Z")], levels)[0]
        ?.gone,
    ).toBe(false);
  });

  /** No listing is no evidence, and a claim on no evidence is worse than none. */
  test("claims nothing about a place where the level never answered", () => {
    expect(
      marked([place("drafts", 12, "2026-09-01T10:00:00.000Z")], [])[0]?.gone,
    ).toBe(false);
    expect(
      marked(
        [place("drafts", 12, "2026-09-01T10:00:00.000Z")],
        [{ scope: "" }],
      )[0]?.gone,
    ).toBe(false);
  });

  test("continues only the places the whole line is a prefix of", () => {
    const places = marked(
      [
        place("projects/notemap/notes/", 41, "2026-09-01T10:00:00.000Z"),
        place("journal/", 6, "2026-09-01T10:00:00.000Z"),
      ],
      [],
    );

    expect(continuing("pro", places).map((each) => each.value)).toEqual([
      "projects/notemap/notes/",
    ]);
  });

  test("offers the best continuation as the text still to come", () => {
    const places = marked(
      [
        place("projects/notemap/notes/", 41, "2026-09-01T10:00:00.000Z"),
        place("projects/kontradiktion/", 6, "2026-09-01T10:00:00.000Z"),
      ],
      [],
    );

    expect(ghostFor("pro", places)).toBe("jects/notemap/notes/");
  });

  /** The ghost is what a person takes without reading, so a discrepancy is never it. */
  test("never offers a gone place as the continuation", () => {
    const levels: Level[] = [
      { scope: "", entries: [folder("journal", "journal")] },
    ];
    const places = marked(
      [place("drafts/deep/", 41, "2026-09-01T10:00:00.000Z")],
      levels,
    );

    expect(places[0]?.gone).toBe(true);
    expect(ghostFor("dra", places)).toBeUndefined();
    expect(continuing("dra", places).map((each) => each.value)).toEqual([
      "drafts/deep/",
    ]);
  });

  /** The ghost is drawn as the text to come, so it may not correct what is there. */
  test("offers no continuation where only ignoring case would match", () => {
    const places = marked(
      [place("projects/notes/", 4, "2026-09-01T10:00:00.000Z")],
      [],
    );

    expect(ghostFor("Proj", places)).toBeUndefined();
    expect(continuing("Proj", places).map((each) => each.value)).toEqual([
      "projects/notes/",
    ]);
  });

  test("offers nothing where the line is empty or already whole", () => {
    const places = marked([place("notes/", 4, "2026-09-01T10:00:00.000Z")], []);

    expect(ghostFor("", places)).toBeUndefined();
    expect(ghostFor("notes/", places)).toBeUndefined();
  });
});
