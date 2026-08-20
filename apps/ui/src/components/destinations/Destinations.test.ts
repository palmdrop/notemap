import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { online } from "../../testing/dom";
import { asked, pool } from "../../testing/pool";
import Destinations from "./Destinations.svelte";

vi.mock("$lib/client", () => import("../../testing/pool"));

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";

const FILESYSTEM = {
  name: "filesystem",
  settingsSchema: {
    type: "object",
    required: ["root"],
    properties: {
      root: { type: "string" },
    },
  },
};

function aDestination(overrides: Record<string, unknown> = {}) {
  return {
    id: VAULT,
    name: "Vault",
    kind: "filesystem",
    settings: { root: "~/notes" },
    retired: false,
    ...overrides,
  };
}

/** A pool holding whatever it is given, answering every route the screen uses. */
function serving(
  held: readonly Record<string, unknown>[],
  overrides: Partial<Record<string, () => Response>> = {},
) {
  return pool((request) => {
    const route = routeOf(request);
    const answer = overrides[route];
    if (answer !== undefined) return answer();

    if (route === "GET /v1/destination-kinds") {
      return json(200, { values: [FILESYSTEM] });
    }
    if (route === "GET /v1/destinations") return json(200, { values: held });
    if (route === `POST /v1/destinations/${VAULT}/retire`) {
      return json(200, aDestination({ retired: true }));
    }
    if (route === `POST /v1/destinations/${VAULT}/unretire`) {
      return json(200, aDestination());
    }
    if (route === "POST /v1/destinations") {
      return json(201, aDestination({ id: "new", name: "Second brain" }));
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

test("lists what the pool holds without asking any destination anything", async () => {
  serving([
    aDestination(),
    aDestination({ id: "b", name: "Board", retired: true }),
  ]);

  render(Destinations);
  await screen.findByText("Vault", { exact: false });
  await screen.findByText("Board", { exact: false });

  // Retired ones are shown as not offered rather than hidden.
  expect(screen.getByText(/retired/)).toBeDefined();
  // The split is the point: listing must not probe an unmounted drive.
  expect(asked()).toEqual([
    "GET /v1/destination-kinds",
    "GET /v1/destinations",
  ]);
});

test("asks one destination what it can do, on request", async () => {
  serving([aDestination()], {
    [`GET /v1/destinations/${VAULT}/description`]: () =>
      json(200, {
        kind: "described",
        capabilities: [{ name: "create-file", accepts: [], targetSchema: {} }],
      }),
  });

  render(Destinations);
  await screen.findByRole("button", { name: "check" });
  await fireEvent.click(screen.getByRole("button", { name: "check" }));

  await screen.findByText("create-file");
  expect(asked()).toContain(`GET /v1/destinations/${VAULT}/description`);
});

test("shows one the daemon cannot make sense of as unusable, and keeps it listed", async () => {
  serving([aDestination({ kind: "kanban" })], {
    [`GET /v1/destinations/${VAULT}/description`]: () =>
      json(200, {
        kind: "unusable",
        detail: "nothing here speaks the kanban kind",
      }),
  });

  render(Destinations);
  await fireEvent.click(await screen.findByRole("button", { name: "check" }));

  await screen.findByText(/unusable: nothing here speaks the kanban kind/);
  expect(screen.getByText("Vault", { exact: false })).toBeDefined();
});

test("adds one from the kind's own schema", async () => {
  serving([]);

  render(Destinations);
  await fireEvent.click(
    await screen.findByRole("button", { name: "add a destination" }),
  );

  // The fields are the kind's, not this component's.
  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/second-brain" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "add" }));

  await screen.findByText("Second brain", { exact: false });

  const created = asked().filter((route) => route === "POST /v1/destinations");
  expect(created).toHaveLength(1);
});

test("retires one, and offers it again", async () => {
  serving([aDestination()]);

  render(Destinations);
  await fireEvent.click(await screen.findByRole("button", { name: "retire" }));

  const again = await screen.findByRole("button", { name: "offer again" });
  await fireEvent.click(again);

  await screen.findByRole("button", { name: "retire" });
  expect(asked()).toContain(`POST /v1/destinations/${VAULT}/retire`);
  expect(asked()).toContain(`POST /v1/destinations/${VAULT}/unretire`);
});

/** Only the pool knows whether a record has ever named it, so its refusal is the answer. */
test("shows the refusal where the pool will not delete one", async () => {
  serving([aDestination()], {
    [`DELETE /v1/destinations/${VAULT}`]: () =>
      json(409, { error: { code: "destination-in-use", destination: VAULT } }),
  });

  render(Destinations);
  await fireEvent.click(await screen.findByRole("button", { name: "delete" }));

  await screen.findByText(/retire it instead/);
  expect(screen.getByText("Vault", { exact: false })).toBeDefined();
});

test("deletes one nothing has ever named", async () => {
  serving([aDestination()], {
    [`DELETE /v1/destinations/${VAULT}`]: () =>
      new Response(null, { status: 204 }),
  });

  render(Destinations);
  await fireEvent.click(await screen.findByRole("button", { name: "delete" }));

  await screen.findByText("none yet");
});

/** Editing is online-only, and the interface makes that visible rather than queuing it. */
test("reads while the pool is unreachable, and disables every change", async () => {
  serving([aDestination()]);
  render(Destinations);
  await screen.findByText("Vault", { exact: false });

  online(false);

  const disabled = (name: string) =>
    (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;

  await vi.waitFor(() => {
    expect(disabled("edit")).toBe(true);
  });
  expect(disabled("retire")).toBe(true);
  expect(disabled("delete")).toBe(true);
  expect(disabled("add a destination")).toBe(true);
  expect(
    screen.getByText(/destinations can be read but not changed/),
  ).toBeDefined();
});

/** A screen opened while the daemon was down would otherwise have no form to add one with. */
test("asks again for the kinds once the daemon is reachable", async () => {
  online(false);
  serving([], {
    "GET /v1/destination-kinds": () => json(503, { error: { code: "x" } }),
  });
  render(Destinations);

  await vi.waitFor(() => {
    expect(
      (
        screen.getByRole("button", {
          name: "add a destination",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  serving([]);
  online(true);

  await vi.waitFor(() => {
    expect(
      (
        screen.getByRole("button", {
          name: "add a destination",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
