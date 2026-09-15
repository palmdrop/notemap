import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import { overflowing } from "$testing/dom";
import Figure from "./Figure.svelte";
import Prose from "./Prose.svelte";
import ClampFixture from "./Clamp.fixture.svelte";

test("draws what a person wrote as CommonMark", () => {
  render(Prose, { text: "# a heading\n\nand *stars* kept\n\n\nthird" });

  expect(screen.getByRole("heading", { name: "a heading" })).toBeDefined();
  expect(screen.getByText("stars").tagName).toBe("EM");
  const written = screen.getAllByText(/./, { selector: "p" });
  expect(written.map((each) => each.textContent?.trim())).toEqual([
    "and stars kept",
    "third",
  ]);
});

/**
 * The break itself is the `rendered` utility's `white-space: pre-line`, which
 * jsdom does not lay out; what it needs is the newline kept in the paragraph.
 */
test("keeps a line break typed inside a paragraph, for the style that draws it", () => {
  render(Prose, { text: "line 1\nline 2\nline 3" });

  const paragraphs = screen.getAllByText(/./, { selector: "p" });
  expect(paragraphs).toHaveLength(1);
  expect(paragraphs[0]?.textContent).toBe("line 1\nline 2\nline 3");
});

test("escapes what looks like HTML rather than drawing it", () => {
  render(Prose, { text: "<b>not bold</b>" });

  expect(screen.getByText("<b>not bold</b>")).toBeDefined();
  expect(document.querySelector("b")).toBeNull();
});

test("says how much more there is, and shows it when asked", async () => {
  overflowing(340, 200, 20);
  render(ClampFixture);

  const cue = await screen.findByRole("button", { name: "+ 7 lines" });
  await fireEvent.click(cue);

  expect(screen.queryByRole("button", { name: /lines/ })).toBeNull();
  expect(screen.getByText("a long note")).toBeDefined();
});

test("says nothing about more lines when nothing is cut off", () => {
  overflowing(200, 200, 20);
  render(ClampFixture);

  expect(screen.queryByRole("button", { name: /lines/ })).toBeNull();
});

test("a stand-in names what it stands in for", () => {
  render(Figure, { label: "photographed page" });
  expect(screen.getByText("photographed page")).toBeDefined();
});
