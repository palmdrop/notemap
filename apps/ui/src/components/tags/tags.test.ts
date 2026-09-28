import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { client, pool, sentUrls } from "$testing/pool";
import { keyboard } from "$testing/dom";
import Feed from "$components/feed/Feed.svelte";
import Queue from "$components/queue/Queue.svelte";

keyboard();

vi.mock("$lib/client", () => import("$testing/pool"));

const went = vi.hoisted(() => ({ to: [] as string[] }));
const replaced = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("$app/navigation", () => ({
  goto: (url: string | URL) => void went.to.push(String(url)),
  replaceState: (url: string | URL) => replaced.urls.push(String(url)),
}));

const at = vi.hoisted(() => ({ path: "/" }));
vi.mock("$app/state", () => ({
  get page() {
    return {
      url: new URL(`http://localhost${at.path}`),
      route: { id: at.path.startsWith("/feed") ? "/feed" : "/" },
    };
  },
}));

afterEach(() => {
  went.to = [];
  replaced.urls = [];
  at.path = "/";
  localStorage.clear();
});

const RESEARCH = {
  id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a80",
  name: "research",
  destination: "vault-1",
  capability: "create",
  arguments: {},
  triggerTag: "route/research",
};

const quoted = (id: string) =>
  anItem(id, {
    tags: [
      {
        name: "kind/quote",
        by: { kind: "person" },
        addedAt: "2026-08-17T10:00:00.000Z",
      },
    ],
  });

function serving(values: { queue?: unknown[]; tags?: unknown[] } = {}) {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue" || route === "GET /v1/feed")
      return json(200, { values: values.queue ?? [] });
    if (route === "GET /v1/tags")
      return json(200, { values: values.tags ?? [] });
    if (route === "GET /v1/templates") return json(200, { values: [RESEARCH] });
    return json(200, { values: [] });
  });
}

test("offers the queue's tags from a dropdown, trigger tags apart, and takes one into the filter", async () => {
  serving({
    tags: [
      { name: "kind/quote", items: 9, unprocessed: 4 },
      { name: "done/only", items: 3, unprocessed: 0 },
      { name: "route/research", items: 2, unprocessed: 1 },
    ],
  });
  await client.templates.load();

  render(Queue);
  await fireEvent.click(screen.getByRole("button", { name: "Filter by tag" }));
  const quote = await screen.findByText("kind/quote");

  // Counted as the queue counts: what it holds, and nothing it holds none of.
  expect(quote.closest("[data-tag]")?.textContent).toContain("4");
  expect(screen.queryByText("done/only")).toBeNull();
  expect(screen.getByText("templates")).toBeTruthy();
  expect(screen.getByText("→ research")).toBeTruthy();

  await fireEvent.mouseDown(quote);

  expect(went.to).toEqual(["http://localhost/?tag=kind%2Fquote"]);
});

test("opens on f, narrows as it is typed into, and takes a tag beside the filter on enter", async () => {
  at.path = "/feed?tag=kind%2Fquote";
  serving({
    tags: [
      { name: "kind/quote", items: 2, unprocessed: 0 },
      { name: "project/a", items: 2, unprocessed: 0 },
      { name: "lang/sv", items: 1, unprocessed: 0 },
    ],
  });

  render(Feed);
  await fireEvent.keyDown(window, { key: "f" });
  const line = await screen.findByRole("combobox", { name: "Find a tag" });
  await vi.waitFor(() => expect(document.activeElement).toBe(line));
  await screen.findByText("lang/sv");

  await fireEvent.input(line, { target: { value: "proj" } });
  expect(screen.queryByText("lang/sv")).toBeNull();
  await fireEvent.keyDown(line, { key: "Enter" });

  // Any set can be taken; the panel stays open for the next.
  expect(went.to).toEqual([
    "http://localhost/feed?tag=kind%2Fquote&tag=project%2Fa",
  ]);
  expect(screen.getByRole("combobox", { name: "Find a tag" })).toBeTruthy();
});

test("takes a tag already in the filter back out of it", async () => {
  at.path = "/feed?tag=kind%2Fquote&tag=project%2Fa";
  serving({ tags: [{ name: "project/a", items: 2, unprocessed: 0 }] });

  render(Feed);
  await fireEvent.click(screen.getByRole("button", { name: "Filter by tag" }));

  // In the filter though nothing is counted for it: it can still be taken off.
  const listed = await screen.findByRole("listbox", { name: "Tags" });
  await fireEvent.mouseDown(within(listed).getByText("kind/quote"));

  expect(went.to).toEqual(["http://localhost/feed?tag=project%2Fa"]);
});

test("shuts the dropdown on escape without touching the filter", async () => {
  at.path = "/feed?tag=kind%2Fquote";
  serving();

  render(Feed);
  await fireEvent.click(screen.getByRole("button", { name: "Filter by tag" }));
  const line = await screen.findByRole("combobox", { name: "Find a tag" });

  await fireEvent.keyDown(line, { key: "Escape" });

  expect(screen.queryByRole("combobox", { name: "Find a tag" })).toBeNull();
  expect(went.to).toEqual([]);
});

test("marks the tags a row carries that the surface is filtered by", async () => {
  at.path = "/feed?tag=kind%2Fquote";
  serving({ queue: [quoted("one")] });

  render(Feed);
  await screen.findByText("one");

  const carried = screen
    .getAllByText("kind/quote")
    .map((word) => word.closest("[data-marked]"));
  expect(carried.some((mark) => mark !== null)).toBe(true);
});

test("reads the queue through the filter on its address, and says what it is", async () => {
  at.path = "/?tag=kind%2Fquote&tag=project%2Fa";
  serving({ queue: [quoted("one")] });

  render(Queue);
  await screen.findByText("one");

  const asked = sentUrls()
    .map((url) => new URL(url))
    .find((url) => url.pathname === "/v1/queue");
  expect(asked?.searchParams.getAll("tag")).toEqual([
    "kind/quote",
    "project/a",
  ]);

  expect(
    screen.getByRole("button", { name: "Filter by tag" }).textContent,
  ).toContain("2");
  expect(screen.queryByText("tagged")).toBeNull();
});

test("leaves the filter alone on escape", async () => {
  at.path = "/feed?tag=kind%2Fquote&tag=project%2Fa";
  serving({ queue: [quoted("one")] });

  render(Feed);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "Escape" });

  expect(went.to).toEqual([]);
});

test("clears the whole filter from the panel at once", async () => {
  at.path = "/?tag=kind%2Fquote&tag=project%2Fa";
  serving();

  render(Queue);
  await fireEvent.click(screen.getByRole("button", { name: "Filter by tag" }));
  await fireEvent.click(await screen.findByRole("button", { name: "clear 2" }));

  expect(went.to).toEqual(["http://localhost/"]);
});

test("offers no clearing without a filter", async () => {
  serving();

  render(Feed);
  await fireEvent.click(screen.getByRole("button", { name: "Filter by tag" }));
  await screen.findByRole("combobox", { name: "Find a tag" });

  expect(screen.queryByRole("button", { name: /^clear/ })).toBeNull();
});

test("says a filtered queue has nothing waiting, never that the queue is drained", async () => {
  at.path = "/?tag=kind%2Fquote";
  serving();

  render(Queue);

  expect(
    await screen.findByText(/Nothing tagged kind\/quote is waiting/),
  ).toBeTruthy();
  expect(screen.queryByText("Nothing left to process.")).toBeNull();

  await fireEvent.click(screen.getByRole("button", { name: "whole queue" }));
  expect(went.to).toEqual(["http://localhost/"]);
});

test("says a filtered feed holds nothing tagged, rather than nothing captured", async () => {
  at.path = "/feed?tag=kind%2Fquote";
  serving();

  render(Feed);

  expect(await screen.findByText(/Nothing is tagged kind\/quote/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "whole feed" })).toBeTruthy();
});

test("holds a selected row whose filter tag is taken off until the selection leaves it", async () => {
  at.path = "/feed?tag=kind%2Fquote";
  serving({ queue: [quoted("one"), quoted("two")] });

  render(Feed);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "j" });
  await client.untag("one", "kind/quote");

  expect(screen.getByText("one")).toBeTruthy();

  await fireEvent.keyDown(window, { key: "Escape" });

  await vi.waitFor(() => expect(screen.queryByText("one")).toBeNull());
  expect(screen.getByText("two")).toBeTruthy();
});
