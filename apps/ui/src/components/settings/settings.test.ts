import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { online } from "$testing/dom";
import { asked, pool } from "$testing/pool";
import Daemon from "./Daemon.svelte";
import Destinations from "./Destinations.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

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

/** Processing a destination happens on the row, which opens on its own name. */
async function open(name: string) {
  return fireEvent.click(await screen.findByRole("button", { name }));
}

const press = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

test("lists what the pool holds without asking any destination anything", async () => {
  serving([
    aDestination(),
    aDestination({ id: "b", name: "Board", retired: true }),
  ]);

  render(Destinations);
  await screen.findByRole("button", { name: "Vault" });
  await screen.findByRole("button", { name: "Board" });

  // Retired ones are shown as not offered rather than hidden, and the section
  // says how the two split.
  expect(screen.getByText("1 offered \u00b7 1 retired")).toBeDefined();
  expect(screen.getByText(/offered to nothing new/)).toBeDefined();

  // The split is the point: listing must not probe an unmounted drive.
  expect(asked()).toEqual([
    "GET /v1/destination-kinds",
    "GET /v1/destinations",
  ]);
});

/** Everything that can be done to one is behind opening it, as on a queue row. */
test("keeps a destination's doings behind opening it", async () => {
  serving([aDestination()]);

  render(Destinations);
  await screen.findByRole("button", { name: "Vault" });
  expect(screen.queryByRole("button", { name: "Retire" })).toBeNull();

  await open("Vault");
  expect(screen.getByRole("button", { name: "Retire" })).toBeDefined();

  await open("Vault");
  expect(screen.queryByRole("button", { name: "Retire" })).toBeNull();
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
  await open("Vault");
  await press("Check");

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
  await open("Vault");
  await press("Check");

  await screen.findByText(/nothing here speaks the kanban kind/);
  expect(screen.getByRole("button", { name: "Vault" })).toBeDefined();
});

test("adds one from the kind's own schema", async () => {
  serving([]);

  render(Destinations);
  await press("Add a destination");

  // The fields are the kind's, not this component's.
  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/second-brain" },
  });
  await press("Create it");

  await screen.findByRole("button", { name: "Second brain" });

  const created = asked().filter((route) => route === "POST /v1/destinations");
  expect(created).toHaveLength(1);
});

test("retires one, and offers it again", async () => {
  serving([aDestination()]);

  render(Destinations);
  await open("Vault");
  await press("Retire");

  await press("Offer again");

  await screen.findByRole("button", { name: "Retire" });
  expect(asked()).toContain(`POST /v1/destinations/${VAULT}/retire`);
  expect(asked()).toContain(`POST /v1/destinations/${VAULT}/unretire`);
});

/** The one thing here that cannot be undone, so the one thing that asks first. */
test("asks before deleting, and offers the reversible half instead", async () => {
  serving([aDestination()]);

  render(Destinations);
  await open("Vault");
  await press("Delete");

  expect(await screen.findByRole("dialog")).toBeDefined();
  expect(asked()).not.toContain(`DELETE /v1/destinations/${VAULT}`);

  await press("Retire instead");
  expect(asked()).toContain(`POST /v1/destinations/${VAULT}/retire`);
});

/** Only the pool knows whether a record has ever named it, so its refusal is the answer. */
test("shows the refusal where the pool will not delete one", async () => {
  serving([aDestination()], {
    [`DELETE /v1/destinations/${VAULT}`]: () =>
      json(409, { error: { code: "destination-in-use", destination: VAULT } }),
  });

  render(Destinations);
  await open("Vault");
  await press("Delete");
  await press("Delete anyway");

  // In the asking, where the alternative it leaves is already on screen.
  await screen.findByText(/retire it instead/);
  expect(screen.getByRole("button", { name: "Retire instead" })).toBeDefined();
});

test("deletes one nothing has ever named", async () => {
  serving([aDestination()], {
    [`DELETE /v1/destinations/${VAULT}`]: () =>
      new Response(null, { status: 204 }),
  });

  render(Destinations);
  await open("Vault");
  await press("Delete");
  await press("Delete anyway");

  await screen.findByText("none yet");
});

/** Editing is online-only, and the interface makes that visible rather than queuing it. */
test("reads while the pool is unreachable, and disables every change", async () => {
  serving([aDestination()]);
  render(Destinations);
  await open("Vault");

  online(false);

  const disabled = (name: string) =>
    (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;

  await vi.waitFor(() => {
    expect(disabled("Edit")).toBe(true);
  });
  expect(disabled("Retire")).toBe(true);
  expect(disabled("Delete")).toBe(true);
  expect(disabled("Add a destination")).toBe(true);

  // Checking is a read, so it survives what the changes do not.
  expect(disabled("Check")).toBe(false);
  expect(
    screen.getByText(/Destinations can be read but not changed/),
  ).toBeDefined();
});

/** A screen opened while the daemon was down would otherwise have no form to add one with. */
test("asks again for the kinds once the daemon is reachable", async () => {
  online(false);
  serving([], {
    "GET /v1/destination-kinds": () => json(503, { error: { code: "x" } }),
  });
  render(Destinations);

  const adding = () =>
    screen.getByRole("button", {
      name: "Add a destination",
    }) as HTMLButtonElement;

  await vi.waitFor(() => expect(adding().disabled).toBe(true));

  serving([]);
  online(true);

  await vi.waitFor(() => expect(adding().disabled).toBe(false));
});

/** Whether the daemon answers is the one fact here about now, so it is asked. */
test("knocks on the daemon and says what came back", async () => {
  serving([aDestination()]);

  render(Daemon);
  expect(screen.getByText("unasked")).toBeDefined();

  await press("Check now");

  await screen.findByText("reachable");
  expect(asked()).toContain("GET /v1/destinations");
});

test("says the daemon is unreachable rather than saying nothing", async () => {
  const transport = serving([aDestination()]);
  transport.unreachable(true);

  render(Daemon);
  await press("Check now");

  await screen.findByText("unreachable");
});
