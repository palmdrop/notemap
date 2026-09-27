import { afterEach, expect, test } from "vitest";

import {
  draftPicture,
  draftWords,
  drafted,
  dropDraft,
  keepDraft,
} from "./edit-drafts.svelte";

const KEY = "notemap:edit-drafts";

afterEach(() => {
  dropDraft("one");
  dropDraft("two");
});

test("keeps the words across a reload, and the picture only in memory", () => {
  keepDraft("one", {
    words: "rewritten",
    picture: { asset: "a", url: "blob:a", name: "a.png", image: true },
  });

  expect(drafted("one")).toBe(true);
  expect(draftWords("one")).toBe("rewritten");
  expect(draftPicture("one")?.asset).toBe("a");
  expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toEqual({
    one: "rewritten",
  });
});

test("a dropped picture is a draft of its own", () => {
  keepDraft("one", { picture: null });

  expect(drafted("one")).toBe(true);
  expect(draftPicture("one")).toBeNull();
  expect(localStorage.getItem(KEY)).toBeNull();
});

test("keeping nothing lets the draft go, and leaves the others be", () => {
  keepDraft("one", { words: "rewritten" });
  keepDraft("two", { words: "kept" });

  keepDraft("one", {});

  expect(drafted("one")).toBe(false);
  expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toEqual({
    two: "kept",
  });
});
