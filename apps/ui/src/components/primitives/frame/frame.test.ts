import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import Nav from "./Nav.svelte";
import Status from "./Status.svelte";

const SURFACES = [
  { href: "/", label: "queue" },
  { href: "/feed", label: "feed" },
];

test("marks the surface being read, and only that one", () => {
  render(Nav, { surfaces: SURFACES, current: "/feed" });

  const link = (name: string) => screen.getByRole("link", { name });

  expect(link("feed").getAttribute("aria-current")).toBe("page");
  expect(link("feed").classList.contains("font-semibold")).toBe(true);
  expect(link("queue").getAttribute("aria-current")).toBeNull();
  expect(link("queue").classList.contains("font-semibold")).toBe(false);
});

/** Pending is ordinary and heals itself, so an idle outbox is not a state of its own. */
test("one glyph says whether the pool is within reach and whether work waits", () => {
  const { rerender } = render(Status, { reachable: true, waiting: 0 });
  const glyph = () => screen.getByRole("status");

  expect(glyph().textContent?.trim()).toBe("●");
  expect(glyph().title).toBe("reachable");

  void rerender({ reachable: false, waiting: 0 });
  expect(glyph().textContent?.trim()).toBe("○");
  expect(glyph().title).toBe("unreachable");

  void rerender({ reachable: false, waiting: 4 });
  expect(glyph().textContent?.trim()).toBe("◐");
  expect(glyph().title).toBe("4 waiting, unreachable");
});
