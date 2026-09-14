import { expect, test, vi } from "vitest";

import { anItem } from "@notemap/client/testing";

import { pool } from "$testing/pool";
import { aboutItem, excerptOf, lineOf } from "./excerpt";

vi.mock("$lib/client", () => import("$testing/pool"));

test("takes the first line, and enough of it to recognise", () => {
  expect(excerptOf("the picker needs a trail")).toBe(
    "the picker needs a trail",
  );
  expect(excerptOf("  a note\nand more below  ")).toBe("a note");
  expect(excerptOf("")).toBeUndefined();
  expect(excerptOf("   \n  ")).toBeUndefined();
});

test("cuts a long capture rather than filling the corner with it", () => {
  const said = excerptOf("x".repeat(200));

  expect(said).toHaveLength(60);
  expect(said?.endsWith("…")).toBe(true);
});

test("names the capture by the stamp its row was read by and its own words", () => {
  pool(() => new Response("{}", { status: 200 }));

  const said = aboutItem(
    anItem("one", {
      createdAt: "2026-09-03T14:32:00.000Z",
      payload: {
        type: "text",
        content: { text: "the picker needs a trail" },
        metadata: {},
        assets: [],
      },
    }),
  );

  expect(said).toContain("the picker needs a trail");
  expect(said).toMatch(/^\d\d-\d\d \d\d:\d\d · /);
});

/** An image says nothing; its type is the only thing there is to say. */
test("falls back to the payload type where nothing was said", () => {
  pool(() => new Response("{}", { status: 200 }));

  const said = aboutItem(
    anItem("one", {
      payload: { type: "image", content: {}, metadata: {}, assets: [] },
    }),
  );

  expect(said).toContain("image");
});

test("cuts a line at a word, and leaves a short one alone", () => {
  expect(lineOf("short")).toBe("short");
  expect(lineOf("")).toBeUndefined();

  const long = `${"word ".repeat(30)}end`;
  const line = lineOf(long);
  expect(line?.length).toBeLessThanOrEqual(98);
  expect(line?.endsWith(" …")).toBe(true);
  expect(line).not.toMatch(/wor …$/);
});

test("takes the first line only", () => {
  expect(lineOf("first\nsecond")).toBe("first");
});
