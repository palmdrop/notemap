import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { address } from "$testing/address.svelte";
import { pool, sent } from "$testing/pool";
import Templates from "./Templates.svelte";

vi.mock("$app/state", () => import("$testing/address.svelte"));

const replaced = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("$app/navigation", () => ({
  goto: () => undefined,
  replaceState: (url: string | URL) => void replaced.urls.push(String(url)),
}));

const VAULT = {
  id: "vault",
  name: "Vault",
  kind: "filesystem",
  settings: {},
  retired: false,
};

const CREATE_OR_APPEND = {
  name: "create-or-append",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    properties: {
      path: { type: "string", title: "place" },
      folder: { type: "string", enum: ["create", "require"] },
    },
  },
};

const ITEM = anItem("one", {
  payload: {
    type: "note",
    content: { text: "A bike rack" },
    metadata: {},
    assets: [],
  },
});

function aRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec",
    item: "one",
    target: {
      kind: "destination",
      destination: "vault",
      capability: "create-or-append",
      arguments: { path: "ideas/a-bike-rack.md", folder: "require" },
    },
    state: "delivered",
    at: "2026-11-01T10:00:00.000Z",
    ...overrides,
  };
}

function serving(record: Record<string, unknown> = aRecord()) {
  pool((request) => {
    switch (routeOf(request)) {
      case "GET /v1/destinations":
        return json(200, { values: [VAULT] });
      case "GET /v1/templates":
        return json(200, { values: [] });
      case "GET /v1/destinations/vault/description":
        return json(200, {
          kind: "described",
          capabilities: [CREATE_OR_APPEND],
        });
      case "GET /v1/items/one":
        return json(200, ITEM);
      case "GET /v1/items/one/routing":
        return json(200, { values: [record] });
      case "POST /v1/templates":
        return json(201, {
          id: "tpl",
          name: "ideas",
          destination: "vault",
          capability: "create-or-append",
          arguments: { path: "ideas/" },
          folder: "require",
          fired: { records: 0 },
        });
      default:
        return json(404, { error: { code: "unknown-route" } });
    }
  });
}

beforeEach(() => {
  replaced.urls.length = 0;
  address.path = "/settings/templates?item=one&record=rec";
});

test("opens the form on the record's decision, the derived name left off", async () => {
  serving();

  render(Templates);

  const place = await screen.findByRole("textbox", { name: "place" });
  await vi.waitFor(() =>
    expect((place as HTMLInputElement).value).toBe("ideas/"),
  );
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "name" }),
  );
  expect(screen.queryByText(/The rewrite stays/)).toBeNull();
});

test("saving creates a template and lets go of the address", async () => {
  serving();

  render(Templates);

  await fireEvent.input(await screen.findByRole("textbox", { name: "name" }), {
    target: { value: "ideas" },
  });
  await vi.waitFor(() =>
    expect(
      (screen.getByRole("textbox", { name: "place" }) as HTMLInputElement)
        .value,
    ).toBe("ideas/"),
  );
  await fireEvent.click(screen.getByRole("button", { name: "save" }));

  await vi.waitFor(async () =>
    expect(await sent()).toContainEqual({
      name: "ideas",
      destination: "vault",
      capability: "create-or-append",
      arguments: { path: "ideas/" },
      folder: "require",
    }),
  );
  await vi.waitFor(() =>
    expect(replaced.urls.at(-1)).toBe("http://localhost/settings/templates"),
  );
});

test("says the rewrite stays behind", async () => {
  const record = aRecord();
  serving({
    ...record,
    target: { ...record.target, content: { text: "Other words" } },
  });

  render(Templates);

  expect(await screen.findByText(/The rewrite stays/)).toBeTruthy();
});

test("says so plainly where the record is not one to save, and draws the section", async () => {
  serving(aRecord({ applied: { template: "tpl", firedByTag: false } }));

  render(Templates);

  expect(
    await screen.findByText(
      "That routing record cannot be saved as a template.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "+ add a template" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "name" })).toBeNull();
});
