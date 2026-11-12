import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { writable } from "svelte/store";
import { expect, test } from "vitest";

import { overflowing } from "$testing/dom";
import { registering, said } from "$testing/highlights";
import Figure from "./Figure.svelte";
import Prose from "./Prose.svelte";
import ProseFixture from "./Prose.fixture.svelte";
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

test("highlights the terms in the words as drawn, and again when the words change", async () => {
  const highlights = registering();
  const { rerender } = render(ProseFixture, {
    text: "Crème **brûlée**, and a _bike_ rack",
    searched: writable({ words: ["creme", "brulee", "rack"] }),
  });

  expect(said(highlights())).toEqual(["Crème", "brûlée", "rack"]);
  expect(screen.getByText("brûlée").tagName).toBe("STRONG");

  await rerender({ text: "a RACK of Brûlée" });
  expect(said(highlights())).toEqual(["RACK", "Brûlée"]);
});

test("leaves the highlight alone while the words searched by stay the same", async () => {
  const highlights = registering();
  const page = { words: ["rack"] };
  const searched = writable(page);
  render(ProseFixture, { text: "a bike rack", searched });
  const before = highlights();

  searched.set(page);
  searched.set({ words: page.words });
  await tick();

  expect(highlights()).toHaveLength(1);
  expect(highlights()[0]).toBe(before[0]);
});

test("highlights what the terms become, and nothing once the words are gone", async () => {
  const highlights = registering();
  const { rerender, unmount } = render(Prose, {
    text: "a RACK of Brûlée",
    terms: ["rack"],
  });

  await rerender({ terms: [] });
  expect(said(highlights())).toEqual([]);

  await rerender({ terms: ["of"] });
  expect(said(highlights())).toEqual(["of"]);

  unmount();
  expect(said(highlights())).toEqual([]);
});

test("draws the words alone where the browser has no highlights", () => {
  render(Prose, { text: "a bike rack", terms: ["rack"] });
  expect(screen.getByText("a bike rack")).toBeDefined();
});
