import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import RoutingComposer from "./RoutingComposer.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";
const BOARD = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a78";

const CREATE_FILE = {
  name: "create-file",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["directory"],
    properties: {
      directory: { type: "string" },
      filename: { type: "string" },
    },
  },
};

const APPEND = { name: "append", accepts: ["text"] };

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

function draw() {
  const closed = vi.fn();
  render(RoutingComposer, {
    props: { item: "one", subject: "a note", onclose: closed },
  });
  return closed;
}

const choose = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

/** The list is pool state; what one can do is I/O, and only the chosen one pays for it. */
test("describes the destination that was chosen and no other", async () => {
  serving([aDestination(), aDestination({ id: BOARD, name: "Board" })]);

  draw();
  await screen.findByRole("button", { name: /Vault/ });
  expect(asked()).toEqual(["GET /v1/destinations"]);

  await choose(/Vault/);
  await screen.findByRole("button", { name: /create-file/ });

  expect(asked()).toEqual([
    "GET /v1/destinations",
    `GET /v1/destinations/${VAULT}/description`,
  ]);
});

test("composes a decision one step at a time and sends it", async () => {
  serving([aDestination()]);

  const closed = draw();
  await choose(/Vault/);
  await choose(/create-file/);

  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "inbox" },
  });
  await choose("route");

  await vi.waitFor(() => {
    expect(closed).toHaveBeenCalled();
  });
  expect(asked()).toContain("POST /v1/items/one/route");
});

test("a capability that asks for nothing is two choices away from routed", async () => {
  serving([aDestination()], { kind: "described", capabilities: [APPEND] });

  draw();
  await choose(/Vault/);
  await choose(/append/);

  const commit = screen.getByRole("button", { name: "route" });
  expect((commit as HTMLButtonElement).disabled).toBe(false);

  await fireEvent.click(commit);
  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/route");
  });
});

test("an unavailable destination stays in the list, says why, and is not routable", async () => {
  serving([aDestination()], {
    kind: "unusable",
    detail: "nothing here speaks the kanban kind",
  });

  draw();
  await choose(/Vault/);

  await screen.findByText(/nothing here speaks the kanban kind/);
  expect(
    (screen.getByRole("button", { name: /Vault/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "route" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test("a retired destination stays in the list and is not offered for new routing", async () => {
  serving([
    aDestination({ retired: true }),
    aDestination({ id: BOARD, name: "Board" }),
  ]);

  draw();

  const retired = await screen.findByRole("button", { name: /Vault/ });
  expect((retired as HTMLButtonElement).disabled).toBe(true);
  expect(retired.textContent).toContain("retired");
  expect(
    (screen.getByRole("button", { name: /Board/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

/** Over the register, so the ways out of it are the modal's own. */
test("is dismissed by the veil, the cross, or Escape", async () => {
  serving([aDestination()]);

  const closed = draw();
  const dialog = await screen.findByRole("dialog");

  await fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(closed).toHaveBeenCalledTimes(1);

  await fireEvent.keyDown(window, { key: "Escape" });
  expect(closed).toHaveBeenCalledTimes(2);

  // The veil, which is what is under the dialog rather than in it.
  await fireEvent.click(dialog.parentElement as HTMLElement);
  expect(closed).toHaveBeenCalledTimes(3);
});

test("says which capture it is about, the row being behind it", async () => {
  serving([aDestination()]);

  draw();

  expect(await screen.findByText("a note")).toBeDefined();
});
