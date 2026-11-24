import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { client, pool } from "$testing/pool";
import { online } from "$testing/dom";
import { firings } from "$lib/firings.svelte";
import { quick } from "$lib/quicking.svelte";
import Framed from "./Quick.fixture.svelte";
import Quick from "./Quick.svelte";

const went = vi.hoisted(() => ({ to: [] as string[] }));
vi.mock("$app/navigation", () => ({
  goto: (url: string) => void went.to.push(url),
}));

afterEach(() => {
  went.to = [];
  firings.clear();
  online(true);
});

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";
const UNTIL = new Date(Date.now() + 10_000).toISOString();

const TEMPLATES = [
  {
    id: "t-vault",
    name: "To the vault",
    destination: VAULT,
    capability: "create",
    arguments: { directory: "seeded" },
  },
  {
    id: "t-todo",
    name: "Todo",
    destination: VAULT,
    capability: "append",
    arguments: { path: "todo.md" },
    asked: { heading: { label: "list" } },
  },
];

function serving() {
  const routed: unknown[] = [];
  pool(async (request) => {
    const route = routeOf(request);
    if (route === "GET /v1/items/one") return json(200, anItem("one"));
    if (route === "GET /v1/destinations") {
      return json(200, {
        values: [
          { id: VAULT, name: "Vault", kind: "filesystem", settings: {} },
        ],
      });
    }
    if (route === "GET /v1/templates") return json(200, { values: TEMPLATES });
    if (route === "POST /v1/items/one/route") {
      routed.push(await request.json());
      return json(200, {
        id: "r1",
        item: "one",
        at: new Date().toISOString(),
        state: "pending",
        until: UNTIL,
        target: {
          kind: "destination",
          destination: VAULT,
          capability: "create",
          arguments: { directory: "seeded" },
        },
        applied: { template: "t-vault", firedByTag: false },
      });
    }
    return json(200, { values: [] });
  });
  return routed;
}

test("lists the templates with where each files, and routes by one that asks nothing", async () => {
  const routed = serving();
  await client.destinations.load();
  await client.templates.load();
  const onclose = vi.fn();
  render(Quick, { item: "one", onclose });

  expect(await screen.findByText("seeded in Vault")).toBeDefined();
  await fireEvent.click(screen.getByRole("button", { name: /To the vault/ }));

  await vi.waitFor(() => expect(routed).toHaveLength(1));
  await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
  expect(routed).toEqual([{ template: "t-vault" }]);
  // In its window from the moment it is made.
  expect(firings.open.map((one) => one.record)).toEqual(["r1"]);
});

test("a template that asks opens in place, and its answer routes", async () => {
  const routed = serving();
  await client.destinations.load();
  await client.templates.load();
  render(Quick, { item: "one", onclose: vi.fn() });

  await fireEvent.click(await screen.findByRole("button", { name: /^Todo/ }));
  const field = await screen.findByLabelText("list");
  await fireEvent.input(field, { target: { value: "Next" } });
  await fireEvent.click(screen.getByRole("button", { name: "Route" }));

  await vi.waitFor(() => expect(routed).toHaveLength(1));
  expect(routed[0]).toEqual({
    template: "t-todo",
    arguments: { heading: "Next" },
  });
});

test("More options leads to the route page", async () => {
  serving();
  // As the frame draws it: closing lets go of the item before it navigates.
  quick.open("one");
  render(Framed);

  await fireEvent.click(
    await screen.findByRole("button", { name: "More options" }),
  );
  expect(quick.item).toBeUndefined();
  expect(went.to).toEqual(["/items/one/process"]);
});

test("with no templates it says where routing is instead", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/items/one"
      ? json(200, anItem("one"))
      : json(200, { values: [] }),
  );
  await client.templates.load();
  render(Quick, { item: "one", onclose: vi.fn() });

  expect(
    await screen.findByText(
      "No templates yet. More options picks a destination.",
    ),
  ).toBeDefined();
});

test("out of reach, it says so and its templates cannot be taken", async () => {
  serving();
  await client.destinations.load();
  await client.templates.load();
  render(Quick, { item: "one", onclose: vi.fn() });
  const vault = await screen.findByRole("button", { name: /To the vault/ });
  online(false);

  await vi.waitFor(() => {
    expect((vault as HTMLButtonElement).disabled).toBe(true);
  });
  expect(screen.getByText(/The pool is out of reach/)).toBeDefined();
});
