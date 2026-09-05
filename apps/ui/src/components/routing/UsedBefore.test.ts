import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import UsedBefore from "./UsedBefore.svelte";

const used = (
  value: string,
  uses: number,
  lastAt = "2026-09-01T10:00:00.000Z",
) => ({ value, uses, lastAt });

function draw(value: string, places: readonly unknown[], chosen?: number) {
  const ontake = vi.fn();
  render(UsedBefore, { props: { value, places, chosen, ontake } as never });
  return { ontake };
}

/** Ranking is the shell's: the pool answers facts and this decides the order. */
test("ranks the most used above what was merely used once", () => {
  draw("pro", [
    used("projects/kontradiktion/", 6),
    used("projects/notemap/notes/", 41),
  ]);

  const drawn = [
    ...screen
      .getByRole("listbox", { name: "places used before" })
      .querySelectorAll('[role="option"]'),
  ].map((each) => (each.textContent ?? "").trim());

  expect(drawn[0]).toContain("projects/notemap/notes/");
  expect(drawn[1]).toContain("projects/kontradiktion/");
});

test("keeps only the places the typed line is still a prefix of", () => {
  draw("jour", [used("projects/notemap/", 41), used("journal/", 6)]);

  const drawn = screen.getAllByRole("option");
  expect(drawn).toHaveLength(1);
  expect(drawn[0]?.textContent).toContain("journal/");
});

/** The path is the thing being read, and it never truncates to fit a count. */
test("puts the count beneath the path rather than beside it", () => {
  draw("", [used("projects/notemap/notes/", 41)]);

  const option = screen.getByRole("option");
  expect(option.children).toHaveLength(2);
  expect(option.children[0]?.textContent).toBe("projects/notemap/notes/");
  expect(option.children[1]?.textContent?.trim()).toMatch(/^41 · /);
});

/** A place the vault no longer holds now reads like any other. */
test("says nothing about a place being gone", () => {
  draw("", [used("drafts/", 12)]);

  expect(screen.queryByText(/gone/)).toBeNull();
});

test("says nothing at all where nothing was used before", () => {
  draw("", []);

  expect(screen.queryByText("used before")).toBeNull();
});

/**
 * The walk names a place by where it sits in `places`, not by where this drew
 * it: ranking happens here and narrowing happens on both sides, so a position
 * in what is on screen is a number the two would have to agree on by luck.
 */
test("marks the one the line's walk has landed on, by its place in the answer", () => {
  draw("", [used("journal/", 6), used("drafts/", 12)]);

  const drawn = screen.getAllByRole("option");
  expect(drawn.map((one) => one.getAttribute("aria-selected"))).toEqual([
    "false",
    "false",
  ]);

  // One in the pool's answer, and drawn first, being the most used.
  draw("", [used("journal/", 6), used("drafts/", 12)], 1);
  const walked = screen.getAllByRole("option").slice(2);
  expect(walked[0]?.textContent).toContain("drafts/");
  expect(walked[0]?.getAttribute("aria-selected")).toBe("true");
  expect(walked[1]?.getAttribute("aria-selected")).toBe("false");
});

/** The id the line points `aria-activedescendant` at is that same position. */
test("names each row by where its place sits in the answer", () => {
  draw("", [used("journal/", 6), used("drafts/", 12)]);

  const drawn = screen.getAllByRole("option");
  expect(drawn.map((one) => one.id)).toEqual([
    "used-before-place-1",
    "used-before-place-0",
  ]);
});

test("takes a place whole when it is pointed at", async () => {
  const { ontake } = draw("", [used("projects/notemap/notes/", 41)]);

  await fireEvent.mouseDown(screen.getByRole("option"));

  expect(ontake).toHaveBeenCalledWith("projects/notemap/notes/");
});
