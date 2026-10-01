import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import Nav from "./Nav.svelte";

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

test("marks a surface read at an address under its own", () => {
  render(Nav, {
    surfaces: [...SURFACES, { href: "/settings", label: "settings" }],
    current: "/settings/destinations",
  });

  const link = (name: string) => screen.getByRole("link", { name });

  expect(link("settings").getAttribute("aria-current")).toBe("page");
  expect(link("queue").getAttribute("aria-current")).toBeNull();
});
