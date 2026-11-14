import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { client, pool } from "$testing/pool";
import { keyboard, viewport } from "$testing/dom";
import Item from "./Item.svelte";
import ItemHead from "./ItemHead.svelte";

keyboard();

const went = vi.hoisted(() => ({ to: [] as string[] }));
vi.mock("$app/navigation", () => ({
  goto: (url: string) => void went.to.push(url),
  afterNavigate: () => {},
}));

afterEach(() => {
  went.to = [];
});

const QUEUED = ["one", "two", "three"].map((id, at) =>
  anItem(id, { createdAt: `2026-11-0${String(at + 1)}T10:00:00.000Z` }),
);

function queued() {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/queue") return json(200, { values: QUEUED });
    const one = QUEUED.find((item) => route === `GET /v1/items/${item.id}`);
    return one === undefined ? json(200, { values: [] }) : json(200, one);
  });
}

test("says where the item stands in its list, and steps through it with Previous and Next", async () => {
  queued();
  await client.loadQueue();
  render(ItemHead, { id: "two" });

  expect(await screen.findByText("2/3")).toBeDefined();
  await fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(went.to).toEqual(["/items/three"]);

  await fireEvent.keyDown(window, { key: "[" });
  expect(went.to).toEqual(["/items/three", "/items/one"]);
});

test("the first item has no Previous to take", async () => {
  queued();
  await client.loadQueue();
  render(ItemHead, { id: "one" });

  await screen.findByText("1/3");
  expect(
    (screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test("is back on a phone and close when wide", async () => {
  queued();
  viewport(390);
  const phone = render(ItemHead, { id: "one" });
  expect(screen.getByRole("button", { name: "Back" })).toBeDefined();
  phone.unmount();

  viewport(1440);
  render(ItemHead, { id: "one" });
  expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
});

test("its ⋯ menu holds Edit and History, which the item publishes", async () => {
  queued();
  await client.loadQueue();
  render(ItemHead, { id: "one" });
  render(Item, { id: "one" });
  await screen.findByText("1/3");

  await fireEvent.click(screen.getByRole("button", { name: "More" }));
  const items = screen
    .getAllByRole("menuitem")
    .map((one) => one.textContent?.trim());
  expect(items).toContain("Edit");
  expect(items).toContain("History");

  await fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
  expect(await screen.findByLabelText("What it says")).toBeDefined();
});
