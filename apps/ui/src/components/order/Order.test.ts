import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { pool } from "$testing/pool";
import Order from "./Order.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

/** Chrome, so it is drawn a level above whichever surface it acts on. */
const at = vi.hoisted(() => ({ path: "/" }));
vi.mock("$app/state", () => ({
  get page() {
    return { url: new URL(`http://localhost${at.path}`) };
  },
}));

/** Shallow routing needs a router, and there is none outside the app. */
const replaced = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("$app/navigation", () => ({
  replaceState: (url: string | URL) => replaced.urls.push(String(url)),
}));

beforeEach(() => {
  replaced.urls = [];
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
  at.path = "/";
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

test("turns the surface being read, and not the other one", async () => {
  at.path = "/feed";
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
  at.path = "/";
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

test("says nothing on a surface with no end to start from", () => {
  at.path = "/settings";
  serving("queue");

  render(Order);

  expect(screen.queryByLabelText("Order")).toBeNull();
});

test("names the order on the URL and remembers it, so a reload reads the same end", async () => {
  at.path = "/";
  serving("queue");

  render(Order);

  await fireEvent.change(screen.getByLabelText("Order"), {
    target: { value: "newest-first" },
  });

  expect(replaced.urls).toEqual(["http://localhost/?order=newest-first"]);
  expect(localStorage.getItem("notemap:order:queue")).toBe("newest-first");
});

test("remembers each surface on its own, the two starting from different ends", async () => {
  at.path = "/feed";
  serving("feed");

  render(Order);

  await fireEvent.change(screen.getByLabelText("Order"), {
    target: { value: "oldest-first" },
  });

  expect(localStorage.getItem("notemap:order:feed")).toBe("oldest-first");
  expect(localStorage.getItem("notemap:order:queue")).toBeNull();
});
