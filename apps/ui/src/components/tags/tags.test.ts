import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { client, pool, sentUrls } from "$testing/pool";
import { address } from "$testing/address.svelte";
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

vi.mock("$app/state", () => import("$testing/address.svelte"));

afterEach(() => {
  went.to = [];
  replaced.urls = [];
  address.path = "/";
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
  await fireEvent.click(
    screen.getByRole("button", { name: /^Filter by tags/ }),
  );
  const quote = await screen.findByText("kind/quote");

  // Counted as the queue counts: what it holds, and nothing it holds none of.
  expect(quote.closest("[data-tag]")?.textContent).toContain("4");
  expect(screen.queryByText("done/only")).toBeNull();
  expect(screen.getByText("templates")).toBeTruthy();
  expect(screen.getByText("→ research")).toBeTruthy();

  await fireEvent.mouseDown(quote);

  expect(went.to).toEqual(["http://localhost/?tag=kind%2Fquote"]);
});

test("opens on f, narrows as it is typed into, and takes a tag into the filter on enter", async () => {
  address.path = "/feed?tag=kind%2Fquote";
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
  address.path = "/feed?tag=kind%2Fquote&tag=project%2Fa";
  serving({ tags: [{ name: "project/a", items: 2, unprocessed: 0 }] });

  render(Feed);
  await fireEvent.click(
    screen.getByRole("button", { name: /^Filter by tags/ }),
  );

  // In the filter though nothing is counted for it: it can still be taken off.
  const listed = await screen.findByRole("listbox", { name: "Tags" });
  await fireEvent.mouseDown(within(listed).getByText("kind/quote"));

  expect(went.to).toEqual(["http://localhost/feed?tag=project%2Fa"]);
});

test("shuts the dropdown on escape without touching the filter", async () => {
  address.path = "/feed?tag=kind%2Fquote";
  serving();

  render(Feed);
  await fireEvent.click(
    screen.getByRole("button", { name: /^Filter by tags/ }),
  );
  const line = await screen.findByRole("combobox", { name: "Find a tag" });

  await fireEvent.keyDown(line, { key: "Escape" });

  expect(screen.queryByRole("combobox", { name: "Find a tag" })).toBeNull();
  expect(went.to).toEqual([]);
});

test("marks the tags a row carries that the surface is filtered by", async () => {
  address.path = "/feed?tag=kind%2Fquote";
  serving({ queue: [quoted("one")] });

  render(Feed);
  await screen.findByText("one");

  const carried = screen
    .getAllByText("kind/quote")
    .map((word) => word.closest("[data-marked]"));
  expect(carried.some((mark) => mark !== null)).toBe(true);
});

test("reads the queue through the filter on its address, and counts it on the control", async () => {
  address.path = "/?tag=kind%2Fquote&tag=project%2Fa";
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
    screen.getByRole("button", { name: /^Filter by tags/ }).textContent,
  ).toContain("2");
});

test("leaves the filter alone on escape", async () => {
  address.path = "/feed?tag=kind%2Fquote&tag=project%2Fa";
  serving({ queue: [quoted("one")] });

  render(Feed);
  await screen.findByText("one");

  await fireEvent.keyDown(window, { key: "Escape" });
  await fireEvent.keyDown(window, { key: "Escape" });

  expect(went.to).toEqual([]);
});

test("clears the whole filter from the panel at once", async () => {
  address.path = "/?tag=kind%2Fquote&tag=project%2Fa";
  serving();

  render(Queue);
  await fireEvent.click(
    screen.getByRole("button", { name: /^Filter by tags/ }),
  );
  await fireEvent.click(await screen.findByRole("button", { name: "clear 2" }));

  expect(went.to).toEqual(["http://localhost/"]);
});

test("offers no clearing without a filter", async () => {
  serving();

  render(Feed);
  await fireEvent.click(
    screen.getByRole("button", { name: /^Filter by tags/ }),
  );
  await screen.findByRole("combobox", { name: "Find a tag" });

  expect(screen.queryByRole("button", { name: /^clear/ })).toBeNull();
});

test("says a filtered queue has nothing waiting, never that the queue is drained", async () => {
  address.path = "/?tag=kind%2Fquote";
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
  address.path = "/feed?tag=kind%2Fquote";
  serving();

  render(Feed);

  expect(await screen.findByText(/Nothing is tagged kind\/quote/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "whole feed" })).toBeTruthy();
});

test("holds a selected row whose filter tag is taken off until the selection leaves it", async () => {
  address.path = "/feed?tag=kind%2Fquote";
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

test("reads the queue through a filter the address names while it is drawn", async () => {
  const other = anItem("other");
  pool((request) => {
    const url = new URL(request.url);
    if (routeOf(request) !== "GET /v1/queue") return json(200, { values: [] });
    return json(200, {
      values:
        url.searchParams.getAll("tag").length === 0
          ? [quoted("one"), other]
          : [quoted("one")],
    });
  });

  render(Queue);
  await screen.findByText("other");

  address.path = "/?tag=kind%2Fquote";

  await vi.waitFor(() => expect(screen.queryByText("other")).toBeNull());
  expect(screen.getByText("one")).toBeTruthy();
  expect(
    sentUrls()
      .map((url) => new URL(url))
      .filter((url) => url.pathname === "/v1/queue")
      .map((url) => url.searchParams.getAll("tag")),
  ).toEqual([[], ["kind/quote"]]);
});

test("offers nothing past cached rows while a new filter's first page is read", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((done) => (release = done));
  pool(async (request) => {
    const url = new URL(request.url);
    if (routeOf(request) !== "GET /v1/feed") return json(200, { values: [] });
    if (url.searchParams.getAll("tag").length > 0) await gate;
    return json(200, { values: [quoted("one"), anItem("other")] });
  });
  address.path = "/feed";

  render(Feed);
  await screen.findByText("other");

  address.path = "/feed?tag=kind%2Fquote";
  await vi.waitFor(() => expect(screen.queryByText("other")).toBeNull());

  expect(screen.getByText("one")).toBeTruthy();
  expect(screen.queryByText(/load more/)).toBeNull();
  release();
});

test("keeps the caret in the panel's line when the filter is cleared", async () => {
  address.path = "/feed?tag=kind%2Fquote";
  serving();

  render(Feed);
  await fireEvent.click(
    screen.getByRole("button", { name: /^Filter by tags/ }),
  );
  const line = await screen.findByRole("combobox", { name: "Find a tag" });
  await vi.waitFor(() => expect(document.activeElement).toBe(line));

  await fireEvent.click(screen.getByRole("button", { name: "clear 1" }));

  expect(document.activeElement).toBe(line);
});

test("shuts the panel when the focus leaves it", async () => {
  serving();

  render(Feed);
  await fireEvent.click(
    screen.getByRole("button", { name: /^Filter by tags/ }),
  );
  const line = await screen.findByRole("combobox", { name: "Find a tag" });

  await fireEvent.focusOut(line, { relatedTarget: document.body });

  expect(screen.queryByRole("combobox", { name: "Find a tag" })).toBeNull();
});

test("says which tags are in the filter as the listbox's selection", async () => {
  address.path = "/feed?tag=kind%2Fquote";
  serving({
    tags: [
      { name: "kind/quote", items: 2, unprocessed: 0 },
      { name: "project/a", items: 2, unprocessed: 0 },
    ],
  });

  render(Feed);
  await fireEvent.click(
    screen.getByRole("button", { name: /^Filter by tags/ }),
  );
  const listed = await screen.findByRole("listbox", { name: "Tags" });
  await within(listed).findByText("project/a");

  expect(
    within(listed)
      .getAllByRole("option", { selected: true })
      .map((option) => option.textContent?.trim()),
  ).toEqual([expect.stringContaining("kind/quote")]);
});

test("opens a new filter at the top, not where the list shrinking under it scrolled", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((done) => (release = done));
  pool(async (request) => {
    if (routeOf(request) !== "GET /v1/feed") return json(200, { values: [] });
    if (new URL(request.url).searchParams.getAll("tag").length > 0) await gate;
    return json(200, { values: [quoted("one")] });
  });
  address.path = "/feed";

  render(Feed);
  await screen.findByText("one");

  address.path = "/feed?tag=kind%2Fquote";
  await tick();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 500 });
  await fireEvent.scroll(window);
  vi.mocked(window.scrollTo).mockClear();
  release();

  await vi.waitFor(() =>
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 }),
  );
});
