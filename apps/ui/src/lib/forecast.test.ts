import type { CandidateEntry } from "@notemap/client";
import { describe, expect, test } from "vitest";

import { forecastOf } from "./forecast";
import type { Level } from "./path-line";

const folder = (label: string, scope: string): CandidateEntry => ({
  label,
  scope,
});

const file = (label: string, value: string): CandidateEntry => ({
  label,
  value,
});

const SAID = { content: { text: "Picker needs a trail" }, item: "item-1" };

const VAULT: Level[] = [
  {
    scope: "",
    entries: [folder("projects", "projects"), file("a.md", "a.md")],
  },
  {
    scope: "projects",
    entries: [
      folder("notemap", "projects/notemap"),
      file("index.md", "projects/index.md"),
    ],
  },
  {
    scope: "projects/notemap",
    entries: [
      file("decisions.md", "projects/notemap/decisions.md"),
      file("decisions-1.md", "projects/notemap/decisions-1.md"),
    ],
  },
];

describe("what committing the line would do", () => {
  test("draws create for a name the folder does not hold", () => {
    const seen = forecastOf(VAULT, "projects/notemap/picker.md", SAID);

    expect(seen).toMatchObject({ word: "create", leaf: "picker.md" });
    expect(seen?.beside).toBeUndefined();
  });

  test("draws append for a name it does", () => {
    expect(
      forecastOf(VAULT, "projects/notemap/decisions.md", SAID),
    ).toMatchObject({ word: "append", leaf: "decisions.md" });
  });

  test("a folder is never the note, however it is named", () => {
    expect(forecastOf(VAULT, "projects", SAID)).toMatchObject({
      word: "create",
      leaf: "projects",
    });
  });

  test("names the folders it will make, outermost first", () => {
    expect(
      forecastOf(VAULT, "projects/notemap/drafts/deep/picker.md", SAID),
    ).toMatchObject({ making: ["drafts", "deep"] });
  });

  /** Nothing can be there to append to inside a folder that is not there. */
  test("draws create where a folder along the path is missing", () => {
    expect(forecastOf(VAULT, "projects/nope/decisions.md", SAID)).toMatchObject(
      { word: "create", making: ["nope"] },
    );
  });

  test("makes nothing where every folder along the path is there", () => {
    expect(
      forecastOf(VAULT, "projects/notemap/picker.md", SAID)?.making,
    ).toEqual([]);
  });
});

describe("a blank leaf is not a gap", () => {
  test("derives the name from what the item says", () => {
    expect(forecastOf(VAULT, "projects/notemap/", SAID)).toMatchObject({
      leaf: "Picker needs a trail.md",
      derived: true,
      word: "create",
    });
  });

  test("falls back to the item where it says nothing nameable", () => {
    expect(
      forecastOf(VAULT, "", { content: { count: 4 }, item: "item-1" }),
    ).toMatchObject({ leaf: "item-1.md", derived: true });
  });

  test("says a name that was typed is not derived", () => {
    expect(forecastOf(VAULT, "projects/notemap/picker.md", SAID)?.derived).toBe(
      false,
    );
  });
});

describe("the way out of an append nobody meant", () => {
  test("offers a free name beside the one that is taken", () => {
    expect(
      forecastOf(VAULT, "projects/notemap/decisions.md", SAID)?.beside,
    ).toBe("decisions-2.md");
  });

  test("counts past every name the folder already holds", () => {
    const held: Level[] = [
      {
        scope: "",
        entries: [file("a.md", "a.md"), file("a-1.md", "a-1.md")],
      },
    ];

    expect(forecastOf(held, "a.md", SAID)?.beside).toBe("a-2.md");
  });

  test("suffixes before the extension, so a note stays a note", () => {
    const held: Level[] = [
      { scope: "", entries: [file("daily.md", "daily.md")] },
    ];

    expect(forecastOf(held, "daily.md", SAID)?.beside).toBe("daily-1.md");
  });
});

/** With nothing to look at there is nothing to forecast, and a guess is worse than none. */
test("forecasts nothing where the destination never answered", () => {
  expect(forecastOf([{ scope: "" }], "a.md", SAID)).toBeUndefined();
  expect(forecastOf([], "a.md", SAID)).toBeUndefined();
});
