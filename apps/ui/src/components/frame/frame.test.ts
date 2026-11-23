import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import Menu from "./Menu.svelte";

test("marks the surface being read, and only that one", () => {
  render(Menu, { current: "/feed" });

  const link = (name: RegExp) => screen.getByRole("link", { name });

  expect(link(/feed/).getAttribute("aria-current")).toBe("page");
  expect(link(/queue/).getAttribute("aria-current")).toBeNull();
});

test("marks a surface read at an address under its own", () => {
  render(Menu, { current: "/settings/destinations" });

  expect(
    screen.getByRole("link", { name: /settings/ }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    screen.getByRole("link", { name: /queue/ }).getAttribute("aria-current"),
  ).toBeNull();
});

test("counts the queue beside its word, and as a rail says it in the icon's label", () => {
  const { unmount } = render(Menu, { current: "/", queue: 13 });
  expect(screen.getByRole("link", { name: /queue/ }).textContent).toContain(
    "13",
  );
  unmount();

  render(Menu, { current: "/", queue: 13, rail: true });
  expect(screen.getByRole("link", { name: "queue, 13" })).toBeDefined();
  expect(screen.getByRole("link", { name: "log" }).getAttribute("title")).toBe(
    "log",
  );
});

test("the menu's foot says offline and when the pool last answered on one line", async () => {
  const { default: Reach } = await import("./Reach.svelte");
  render(Reach, {
    reachable: false,
    at: new Date(2026, 10, 18, 12, 17).toISOString(),
    who: "no password set",
  });

  const said = screen.getByRole("status");
  expect(said.textContent?.trim()).toBe("offline 12:17");
  expect(said.getAttribute("title")).toBe("offline, last answered 12:17");
});

test("the menu's squares say today's date and how much was captured today", async () => {
  const { default: Glance } = await import("./Glance.svelte");
  render(Glance);

  const today = screen.getByRole("group", { name: "Today" });
  expect(today.textContent).toContain(String(new Date().getDate()));
  expect(today.textContent).toContain("Captured today");
});

test("a page's levels above it lead its title as links when wide", async () => {
  const { default: Headed } = await import("./Header.fixture.svelte");
  render(Headed, {
    heading: {
      title: "Vault",
      trail: [
        { label: "settings", href: "/settings" },
        { label: "destinations", href: "/settings/destinations" },
      ],
    },
  });

  const trail = await screen.findByRole("navigation", { name: "Breadcrumb" });
  expect(
    [...trail.querySelectorAll("a")].map((one) => [
      one.textContent,
      one.getAttribute("href"),
    ]),
  ).toEqual([
    ["settings", "/settings"],
    ["destinations", "/settings/destinations"],
  ]);
  expect(screen.getByRole("heading", { level: 1 }).textContent?.trim()).toBe(
    "Vault",
  );
});
