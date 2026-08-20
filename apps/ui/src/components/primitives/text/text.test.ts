import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import { overflowing } from "../../../testing/dom";
import Figure from "./Figure.svelte";
import Prose from "./Prose.svelte";
import ClampFixture from "./Clamp.fixture.svelte";

test("breaks what a person wrote into paragraphs, and changes not a character", () => {
  render(Prose, { text: "# a heading\n\nand *stars* kept\n\n\nthird" });

  const written = screen.getAllByText(/./, { selector: "p" });
  expect(written.map((each) => each.textContent?.trim())).toEqual([
    "# a heading",
    "and *stars* kept",
    "third",
  ]);
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
