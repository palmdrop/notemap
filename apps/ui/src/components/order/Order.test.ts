import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { pool } from "$testing/pool";
import { log } from "$lib/log.svelte";
import Order from "./Order.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

/** Chrome, so it is drawn a level above whichever surface it acts on. */
const at = vi.hoisted(() => ({ route: "/", path: "/" }));
vi.mock("$app/state", () => ({
  get page() {
    return {
      url: new URL(`http://localhost${at.path}`),
      route: { id: at.route },
    };
  },
}));

/** Shallow routing needs a router, and there is none outside the app. */
const replaced = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("$app/navigation", () => ({
  replaceState: (url: string | URL) => replaced.urls.push(String(url)),
}));

beforeEach(() => {
  replaced.urls = [];
  // Module-scoped, and the log a test turned around is not the next one's.
  log.forget();
});

function serving(surface: "queue" | "feed", handler?: () => Promise<void>) {
  return pool(async (request: Request) => {
    if (routeOf(request) !== `GET /v1/${surface}`) {
      return json(200, { values: [] });
    }
    await handler?.();
    return json(200, { values: [anItem("one")] });
  });
}

function ordersOf(transport: { sent: readonly Request[] }, surface: string) {
  return transport.sent
    .filter((request) => routeOf(request) === `GET /v1/${surface}`)
    .map((request) => new URL(request.url).searchParams.get("order"));
}

test("turns the queue around and reads it again from that end", async () => {
  at.route = at.path = "/";
  const transport = serving("queue");

  const { component } = render(Order) as { component: unknown };
  expect(component).toBeDefined();

  await fireEvent.change(screen.getByLabelText("Order"), {
    target: { value: "newest-first" },
  });

  await vi.waitFor(() => {
    expect(ordersOf(transport, "queue")).toEqual(["newest-first"]);
  });
});

/**
 * The log has to be told. `replaceState` moves the address bar without
 * assigning `page.url`, so a surface waiting to read its own order off the URL
 * waits until somebody reloads.
 */
test("turns the log around and reads it again from that end", async () => {
  at.route = at.path = "/log";
  const transport = pool(() => json(200, { values: [] }));

  render(Order);

  await fireEvent.change(screen.getByLabelText("Order"), {
    target: { value: "oldest-first" },
  });

  await vi.waitFor(() => {
    expect(ordersOf(transport, "actions")).toEqual(["oldest-first"]);
  });
});

test("turns the surface being read, and not the other one", async () => {
  at.route = at.path = "/feed";
  const transport = serving("feed");

  render(Order);

  await fireEvent.change(screen.getByLabelText("Order"), {
    target: { value: "newest-first" },
  });

  await vi.waitFor(() => {
    expect(ordersOf(transport, "feed")).toEqual(["newest-first"]);
  });
  expect(ordersOf(transport, "queue")).toEqual([]);
});

test("will not turn around while a read is still walking", async () => {
  at.route = at.path = "/";
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  const transport = serving("queue", () => held);

  render(Order);
  const control = screen.getByLabelText("Order") as HTMLSelectElement;

  // Nothing is walking until something asks, which the surface does on mount.
  void transport;
  await fireEvent.change(control, { target: { value: "newest-first" } });
  await vi.waitFor(() => expect(control.disabled).toBe(true));

  release();
  await vi.waitFor(() => expect(control.disabled).toBe(false));
});

test.each([
  ["/settings", "/settings"],
  ["/items/[id]", "/items/one"],
])("says nothing on %s, which has no end to start from", (route, path) => {
  at.route = route;
  at.path = path;
  serving("queue");

  render(Order);

  expect(screen.queryByLabelText("Order")).toBeNull();
});

test("names the order on the URL and remembers it, so a reload reads the same end", async () => {
  at.route = at.path = "/";
  serving("queue");

  render(Order);

  await fireEvent.change(screen.getByLabelText("Order"), {
    target: { value: "newest-first" },
  });

  expect(replaced.urls).toEqual(["http://localhost/?order=newest-first"]);
  expect(localStorage.getItem("notemap:order:queue")).toBe("newest-first");
});

test("remembers each surface on its own, the two starting from different ends", async () => {
  at.route = at.path = "/feed";
  serving("feed");

  render(Order);

  await fireEvent.change(screen.getByLabelText("Order"), {
    target: { value: "oldest-first" },
  });

  expect(localStorage.getItem("notemap:order:feed")).toBe("oldest-first");
  expect(localStorage.getItem("notemap:order:queue")).toBeNull();
});
