import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { notices } from "$lib/notices.svelte";
import { viewport } from "$testing/dom";

import Drawer from "./Drawer.svelte";
import Listed from "./Header.list.fixture.svelte";
import Menu from "./Menu.svelte";
import { searching } from "./searching.svelte";
import Strip from "./Strip.svelte";

afterEach(() => {
  notices.clear();
  searching.close();
});

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

test("the menu's foot says nothing about reach until it is known", async () => {
  const { default: Reach } = await import("./Reach.svelte");
  render(Reach, { reachable: undefined, at: undefined, who: "" });

  expect(screen.queryByText(/online|offline/)).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
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

test("the strip says a late refusal once in red, and goes with its × or its Show", async () => {
  render(Strip);
  notices.raise({
    what: "rejected by",
    subject: "Vault",
    href: "/items/one",
    strip: true,
    alarm: true,
  });

  const strip = await screen.findByRole("alert");
  expect(strip.textContent).toContain("Vault");
  await fireEvent.click(screen.getByRole("link", { name: "Show" }));
  await vi.waitFor(() => {
    expect(screen.queryByRole("alert")).toBeNull();
  });

  notices.raise({ what: "rejected by", subject: "Vault", strip: true });
  await screen.findByRole("alert");
  await fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  await vi.waitFor(() => {
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

test("the drawer says what waits to send, and closes once by its × or esc", async () => {
  const onclose = vi.fn();
  render(Drawer, {
    current: "/",
    queue: 3,
    waiting: 2,
    reachable: true,
    at: undefined,
    who: "signed in",
    onclose,
  });

  expect(screen.getByText("2 waiting to send")).toBeDefined();
  await fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await fireEvent(
    screen.getByRole("dialog", { name: "Menu" }),
    new Event("cancel"),
  );
  expect(onclose).toHaveBeenCalledTimes(1);
});

test("a list's head counts what its filter holds, and on a phone search takes the head", async () => {
  viewport(390);
  const onfilter = vi.fn();
  render(Listed, { filtered: 2, onfilter });

  await fireEvent.click(screen.getByRole("button", { name: "Filter, 2 on" }));
  expect(onfilter).toHaveBeenCalled();

  await fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(
    await screen.findByRole("button", { name: "Close search" }),
  ).toBeDefined();
  expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
});

test("rows selected for a batch take the head: how many, All and a way out", async () => {
  viewport(390);
  const all = vi.fn();
  const clear = vi.fn();
  render(Listed, {
    chosen: { count: 3, full: undefined, all, clear, deeds: [] },
  });

  expect(
    (await screen.findByRole("heading", { level: 1 })).textContent,
  ).toContain("3 selected");
  await fireEvent.click(screen.getByRole("button", { name: "All" }));
  await fireEvent.click(
    screen.getByRole("button", { name: "Clear the selection" }),
  );
  expect(all).toHaveBeenCalled();
  expect(clear).toHaveBeenCalled();
});
