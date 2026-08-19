import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import Nav from "./Nav.svelte";
import Reachability from "./Reachability.svelte";

const SURFACES = [
  { href: "/", label: "queue" },
  { href: "/feed", label: "feed" },
];

test("marks the surface being read, and only that one", () => {
  render(Nav, { surfaces: SURFACES, current: "/feed" });

  const marked = (name: string) =>
    screen.getByRole("link", { name }).getAttribute("aria-current");

  expect(marked("feed")).toBe("page");
  expect(marked("queue")).toBeNull();
});

test("says whether the pool is within reach", () => {
  const { rerender } = render(Reachability, { yes: true });
  expect(screen.getByRole("status").textContent?.trim()).toBe("online");

  void rerender({ yes: false });
  expect(screen.getByRole("status").textContent?.trim()).toBe("offline");
});
