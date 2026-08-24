import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { pool } from "../../testing/pool";
import Order from "./Order.svelte";

vi.mock("$lib/client", () => import("../../testing/pool"));

/** Chrome, so it is drawn a level above whichever surface it acts on. */
const at = vi.hoisted(() => ({ path: "/" }));
vi.mock("$app/state", () => ({
  get page() {
    return { url: new URL(`http://localhost${at.path}`) };
  },
}));

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
