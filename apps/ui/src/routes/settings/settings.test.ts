import { createRawSnippet } from "svelte";
import { render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { viewport } from "$testing/dom";
import Layout from "./+layout.svelte";
import IndexPage from "./+page.svelte";
import Menu from "$components/settings/Menu.svelte";

/** Leaving the surface needs a router, and there is none outside the app. */
const went = vi.hoisted(() => ({ to: [] as string[] }));
vi.mock("$app/navigation", () => ({
  goto: (url: string) => void went.to.push(url),
}));
vi.mock("$app/paths", () => ({
  resolve: (path: string, params?: Record<string, string>) =>
    params === undefined
      ? path
      : Object.entries(params).reduce(
          (made, [key, value]) => made.replace(`[${key}]`, value),
          path,
        ),
}));

const atSection = vi.hoisted(() => ({
  route: { id: "/settings/[section]" as string },
  params: { section: "templates" as string },
}));
vi.mock("$app/state", () => ({
  get page() {
    return atSection;
  },
}));

const children = createRawSnippet(() => ({
  render: () => `<p>the section</p>`,
}));

test("the menu marks the current section, and leaves the rest plain", () => {
  atSection.params.section = "templates";
  render(Menu);

  const templates = screen.getByRole("link", { name: "Templates" });
  expect(templates.getAttribute("aria-current")).toBe("page");
  expect(templates.classList.contains("font-semibold")).toBe(true);

  const destinations = screen.getByRole("link", { name: "Destinations" });
  expect(destinations.getAttribute("aria-current")).toBeNull();
  expect(destinations.classList.contains("font-semibold")).toBe(false);
});

test("on a section, the menu is hidden below `narrow` and the section is not", () => {
  atSection.route.id = "/settings/[section]";

  const { container } = render(Layout, { children });

  const [rail, section] = container.querySelectorAll(":scope > div > div");
  expect(rail?.className).toContain("max-narrow:hidden");
  expect(section?.className).not.toContain("max-narrow:hidden");
});

test("bare `/settings`, the menu is not hidden and the section is", () => {
  atSection.route.id = "/settings";

  const { container } = render(Layout, { children });

  const [rail, section] = container.querySelectorAll(":scope > div > div");
  expect(rail?.className).not.toContain("max-narrow:hidden");
  expect(section?.className).toContain("max-narrow:hidden");
});

test("`/settings` redirects to destinations from `narrow` up", async () => {
  viewport(1024);
  went.to = [];

  render(IndexPage);

  await vi.waitFor(() => expect(went.to).toContain("/settings/destinations"));
});

test("`/settings` draws the menu alone below `narrow`, and does not redirect", async () => {
  viewport(600);
  went.to = [];

  render(IndexPage);

  // Nothing to wait for succeeding, so this waits out the window a redirect
  // would have landed in instead.
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(went.to).toEqual([]);
});
