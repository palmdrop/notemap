import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "../../testing/pool";
import RouteAction from "./RouteAction.svelte";

vi.mock("$lib/client", () => import("../../testing/pool"));

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";
const BOARD = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a78";

const CREATE_FILE = {
  name: "create-file",
  accepts: ["text"],
  targetSchema: {
    type: "object",
    required: ["directory"],
    properties: {
      directory: { type: "string" },
      filename: { type: "string" },
    },
  },
};

function aDestination(overrides: Record<string, unknown> = {}) {
  return {
    id: VAULT,
    name: "Vault",
    kind: "filesystem",
    settings: {},
    retired: false,
    ...overrides,
  };
}

function serving(
  held: readonly Record<string, unknown>[],
  description: Record<string, unknown> = {
    kind: "described",
    capabilities: [CREATE_FILE],
  },
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") return json(200, { values: held });
    if (route.endsWith("/description")) return json(200, description);
    if (route === "POST /v1/items/one/route") {
      return json(200, {
        id: "r",
        item: "one",
        state: "delivered",
        target: {},
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

const reveal = () =>
  fireEvent.click(screen.getByRole("button", { name: "Route…" }));

const draw = () =>
  render(RouteAction, { props: { item: "one", disabled: false } });

/** The list is pool state; what one can do is I/O, and only the chosen one pays for it. */
test("reads the declarations, and describes only what was chosen", async () => {
  serving([aDestination()]);

  draw();
  await reveal();
  await screen.findByRole("option", { name: "Vault" });

  expect(asked()).toEqual(["GET /v1/destinations"]);

  await fireEvent.change(screen.getByLabelText("Destination"), {
    target: { value: VAULT },
  });

  await screen.findByRole("option", { name: "create-file" });
  expect(asked()).toEqual([
    "GET /v1/destinations",
    `GET /v1/destinations/${VAULT}/description`,
  ]);
});

/** Which destinations exist is not stable for the life of a connection. */
test("reads the list again each time the picker is opened", async () => {
  serving([aDestination()]);

  draw();
  await reveal();
  await screen.findByRole("option", { name: "Vault" });

  await reveal();
  await reveal();
  await vi.waitFor(() => {
    expect(asked().filter((route) => route === "GET /v1/destinations")).toEqual(
      ["GET /v1/destinations", "GET /v1/destinations"],
    );
  });
});

test("does not offer a retired destination for new routing", async () => {
  serving([
    aDestination({ retired: true }),
    aDestination({ id: BOARD, name: "Board" }),
  ]);

  draw();
  await reveal();
  await screen.findByRole("option", { name: "Board" });

  expect(screen.queryByRole("option", { name: "Vault" })).toBeNull();
});

test("shows one it cannot describe as present and unavailable", async () => {
  serving([aDestination()], {
    kind: "unusable",
    detail: "nothing here speaks the kanban kind",
  });

  draw();
  await reveal();
  // The options arrive with the read, so choosing one has to wait for them.
  await screen.findByRole("option", { name: "Vault" });
  await fireEvent.change(screen.getByLabelText("Destination"), {
    target: { value: VAULT },
  });

  await screen.findByText(/unavailable — nothing here speaks the kanban kind/);
  // Nothing to build a target against, so there is nothing to send.
  expect(screen.queryByRole("button", { name: "Route" })).toBeNull();
});

test("builds the target from the capability's schema and routes", async () => {
  serving([aDestination()]);

  draw();
  await reveal();
  // The options arrive with the read, so choosing one has to wait for them.
  await screen.findByRole("option", { name: "Vault" });
  await fireEvent.change(screen.getByLabelText("Destination"), {
    target: { value: VAULT },
  });

  await fireEvent.change(await screen.findByLabelText("Capability"), {
    target: { value: "create-file" },
  });

  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Route" }));

  await screen.findByText("routed — delivered");
  expect(asked()).toContain("POST /v1/items/one/route");
});
