import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { online } from "$testing/dom";
import { asked, client, pool, sent } from "$testing/pool";
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
  overrides: Partial<Record<string, () => Promise<Response> | Response>> = {},
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

const described = () =>
  json(200, {
    kind: "described",
    capabilities: [{ name: "create", accepts: [], argumentsSchema: {} }],
  });

/** Processing a destination happens on the row, which opens on its own name. */
async function open(name: string) {
  return fireEvent.click(await screen.findByRole("button", { name }));
}

const press = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

test("lists what the pool holds, disabled ones hidden until shown", async () => {
  serving(
    [aDestination(), aDestination({ id: "b", name: "Board", retired: true })],
    {
      [`GET /v1/destinations/${VAULT}/description`]: () => described(),
      [`GET /v1/destinations/${VAULT}/probe`]: () =>
        json(200, { kind: "ready" }),
    },
  );

  render(Destinations);
  await screen.findByRole("button", { name: "Vault" });
  expect(screen.queryByRole("button", { name: "Board" })).toBeNull();
  expect(screen.getByText("1 disabled · show")).toBeDefined();

  await press("1 disabled · show");
  await screen.findByRole("button", { name: "Board" });
  expect(screen.getByText("disabled")).toBeDefined();

  // The list still fills from pool state alone; both questions follow it.
  await screen.findByText(/available/);
  expect(asked().sort()).toEqual([
    "GET /v1/destination-kinds",
    "GET /v1/destinations",
    `GET /v1/destinations/${VAULT}/description`,
    `GET /v1/destinations/${VAULT}/probe`,
  ]);

  await press("1 disabled · hide");
  expect(screen.queryByRole("button", { name: "Board" })).toBeNull();
});

test("says what a destination can do without anyone asking it to", async () => {
  serving([aDestination()], {
    [`GET /v1/destinations/${VAULT}/description`]: () =>
      json(200, {
        kind: "described",
        capabilities: [{ name: "create", accepts: [], argumentsSchema: {} }],
      }),
  });

  render(Destinations);
  await open("Vault");

  await screen.findByText("create");
});

test("says a destination is not really there, though it describes itself fine", async () => {
  serving([aDestination()], {
    [`GET /v1/destinations/${VAULT}/description`]: () => described(),
    [`GET /v1/destinations/${VAULT}/probe`]: () =>
      json(200, { kind: "rejected", detail: "~/notes is not there" }),
  });

  render(Destinations);

  await screen.findByText(/~\/notes is not there/);
});

test("says nothing at all where the kind cannot be probed", async () => {
  serving([aDestination()], {
    [`GET /v1/destinations/${VAULT}/description`]: () => described(),
    [`GET /v1/destinations/${VAULT}/probe`]: () =>
      json(200, { kind: "not-offered" }),
  });

  render(Destinations);

  await screen.findByText(/answered/);
  expect(screen.queryByText(/not-offered/)).toBeNull();
});

test("leaves one that cannot describe itself saying so, and the rest listed", async () => {
  serving([aDestination(), aDestination({ id: "b", name: "Board" })], {
    [`GET /v1/destinations/${VAULT}/description`]: () =>
      json(200, { kind: "undescribable", detail: "the drive is not mounted" }),
    "GET /v1/destinations/b/description": () =>
      json(200, {
        kind: "described",
        capabilities: [{ name: "create", accepts: [], argumentsSchema: {} }],
      }),
  });

  render(Destinations);

  await screen.findByText(/the drive is not mounted/);
  await screen.findByText(/answered/);
});

/** The one worth re-asking on: it may simply have been asleep. */
test("asks a destination that was unreachable again, once the pool is back", async () => {
  let answers = 0;
  const transport = serving([aDestination()], {
    [`GET /v1/destinations/${VAULT}/description`]: () => described(),
    [`GET /v1/destinations/${VAULT}/probe`]: () => {
      answers += 1;
      return json(200, { kind: "unreachable", detail: "the drive is asleep" });
    },
  });

  render(Destinations);
  await screen.findByText(/unavailable — the drive is asleep/);
  expect(answers).toBe(1);

  transport.unreachable(true);
  online(false);
  await vi.waitFor(() =>
    expect(screen.getByText(/read but not changed/)).toBeDefined(),
  );

  transport.unreachable(false);
  online(true);
  await vi.waitFor(() => expect(answers).toBe(2));
});

/** A settled answer is not asked twice: only what could not be reached is. */
test("does not ask a destination that already answered", async () => {
  let answers = 0;
  serving([aDestination()], {
    [`GET /v1/destinations/${VAULT}/description`]: () => described(),
    [`GET /v1/destinations/${VAULT}/probe`]: () => {
      answers += 1;
      return json(200, { kind: "rejected", detail: "~/notes is not there" });
    },
  });

  render(Destinations);
  await screen.findByText(/~\/notes is not there/);

  // The list re-emitting is what re-runs the asking, so it is what must not.
  await client.destinations.load();
  await vi.waitFor(() => expect(asked()).toContain("GET /v1/destinations"));
  expect(answers).toBe(1);
});

/**
 * The call that can hang is the one that must say it is running: describing
 * answers at once, so a row whose probe is still out used to read "unasked".
 */
test("says a row is being asked while its probe is still out", async () => {
  let answer: ((value: Response) => void) | undefined;
  serving([aDestination()], {
    [`GET /v1/destinations/${VAULT}/description`]: () => described(),
    [`GET /v1/destinations/${VAULT}/probe`]: () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
  });

  render(Destinations);
  await open("Vault");

  // Describing has landed; only the probe is still out.
  await screen.findByText("create");
  expect(screen.queryByText("unasked")).toBeNull();
  // The row's lead and its status both stand where the answer will.
  expect((await screen.findAllByText("loading")).length).toBe(2);

  answer?.(json(200, { kind: "ready" }));
  await screen.findAllByText(/available/);
});

test("the opened row is a box, and the rest are ruled", async () => {
  serving([aDestination(), aDestination({ id: "other", name: "Other" })]);

  render(Destinations);
  const vault = await screen.findByRole("button", { name: "Vault" });
  const row = (name: string) =>
    screen.getByRole("button", { name }).closest("div.py-4") as HTMLElement;

  expect(row("Vault").classList.contains("border")).toBe(false);
  await fireEvent.click(vault);
  expect(row("Vault").classList.contains("border")).toBe(true);
  expect(row("Other").classList.contains("border")).toBe(false);

  await open("Other");
  expect(row("Vault").classList.contains("border")).toBe(false);
  expect(row("Other").classList.contains("border")).toBe(true);
});

test("keeps a destination's doings behind opening it", async () => {
  serving([aDestination()]);

  render(Destinations);
  await screen.findByRole("button", { name: "Vault" });
  expect(screen.queryByRole("button", { name: "disable" })).toBeNull();

  await open("Vault");
  expect(screen.getByRole("button", { name: "disable" })).toBeDefined();

  await open("Vault");
  expect(screen.queryByRole("button", { name: "disable" })).toBeNull();
});

test("asks one destination what it can do, on request", async () => {
  serving([aDestination()], {
    [`GET /v1/destinations/${VAULT}/description`]: () =>
      json(200, {
        kind: "described",
        capabilities: [{ name: "create", accepts: [], argumentsSchema: {} }],
      }),
  });

  render(Destinations);
  await open("Vault");
  await press("check again");

  await screen.findByText("create");
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
  await press("check again");

  // Said both on the collapsed line and, opened, in the facts grid.
  await vi.waitFor(() =>
    expect(
      screen.getAllByText(/nothing here speaks the kanban kind/).length,
    ).toBeGreaterThan(0),
  );
  expect(screen.getByRole("button", { name: "Vault" })).toBeDefined();
});

test("adds one from the kind's own schema", async () => {
  serving([]);

  render(Destinations);
  await press("+ add a destination");

  // The fields are the kind's, not this component's.
  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/second-brain" },
  });
  // Nothing is known yet, so the button already says what it is about to do.
  await press("use it anyway");

  await screen.findByRole("button", { name: "Second brain" });

  const created = asked().filter((route) => route === "POST /v1/destinations");
  expect(created).toHaveLength(1);
});

/**
 * A field named `profile` is a box nobody can fill in from the name alone. What
 * says an account is meant, and that it is one the daemon's config declares, is
 * the kind's own description of the field, so the form has to show it.
 */
test("draws a field's label and its control, never its description", async () => {
  serving([], {
    "GET /v1/destination-kinds": () =>
      json(200, {
        values: [
          {
            name: "webdav",
            settingsSchema: {
              type: "object",
              required: ["profile"],
              properties: {
                profile: {
                  type: "string",
                  title: "Account",
                  description: "The name of an account in the configuration.",
                },
              },
            },
          },
        ],
      }),
  });

  render(Destinations);
  await press("+ add a destination");

  await screen.findByRole("textbox", { name: "profile" });
  expect(
    screen.queryByText("The name of an account in the configuration."),
  ).toBeNull();
});

function webdavKind(accounts: readonly string[]) {
  return {
    name: "webdav",
    settingsSchema: {
      type: "object",
      required: ["account", "root"],
      properties: {
        account: { type: "string", examples: [...accounts] },
        root: { type: "string" },
      },
    },
  };
}

test("offers the accounts the daemon declares, rather than a box to type one into", async () => {
  serving([], {
    "GET /v1/destination-kinds": () =>
      json(200, { values: [webdavKind(["home", "work"])] }),
  });

  render(Destinations);
  await press("+ add a destination");

  await screen.findByRole("button", { name: "home" });
  expect(screen.getByRole("button", { name: "work" })).toBeDefined();

  // A daemon declaring no accounts must not trap a person behind an empty list.
  expect(screen.getByLabelText("root").tagName).toBe("INPUT");
});

test("chooses a setting the schema fixes, rather than typing it from memory", async () => {
  serving([], {
    "GET /v1/destination-kinds": () =>
      json(200, {
        values: [
          {
            name: "filesystem",
            settingsSchema: {
              type: "object",
              required: ["root"],
              properties: {
                root: { type: "string" },
                frontmatter: {
                  type: "string",
                  enum: ["full", "none"],
                  default: "none",
                },
              },
            },
          },
        ],
      }),
  });

  render(Destinations);
  await press("+ add a destination");

  // Blank leads, because an unset one is what a destination that never said
  // has — and it says what unset comes out as, since nothing else here does.
  await screen.findByRole("button", { name: "default (none)" });
  expect(screen.getByRole("button", { name: "full" })).toBeDefined();
  expect(screen.getByRole("button", { name: "none" })).toBeDefined();
});

/** A boolean setting is two options under a person's words, and a chosen `no` is sent as one. */
test("chooses a boolean setting as yes or no, and says what unset comes out as", async () => {
  serving([], {
    "GET /v1/destination-kinds": () =>
      json(200, {
        values: [
          {
            name: "filesystem",
            settingsSchema: {
              type: "object",
              required: ["root"],
              properties: {
                root: { type: "string" },
                hashtags: { type: "boolean", default: false },
              },
            },
          },
        ],
      }),
  });

  render(Destinations);
  await press("+ add a destination");

  await screen.findByRole("button", { name: "default (no)" });
  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/second-brain" },
  });
  await press("no");
  await press("use it anyway");

  await vi.waitFor(async () => {
    expect(await sent()).toContainEqual({
      name: "Second brain",
      kind: "filesystem",
      settings: { root: "~/second-brain", hashtags: false },
    });
  });
});

/** A setting the kind offers only under a condition is not drawn while the condition fails. */
test("hides a setting the others make meaningless", async () => {
  serving([], {
    "GET /v1/destination-kinds": () =>
      json(200, {
        values: [
          {
            name: "filesystem",
            settingsSchema: {
              type: "object",
              required: ["root"],
              properties: {
                root: { type: "string" },
                hashtags: { type: "boolean", default: false },
                extra: {
                  type: "string",
                  "x-notemap-when": [{ field: "hashtags", is: [true] }],
                },
              },
            },
          },
        ],
      }),
  });

  render(Destinations);
  await press("+ add a destination");
  await screen.findByRole("button", { name: "default (no)" });

  expect(screen.queryByText(/^extra/)).toBeNull();
  await press("yes");
  expect(await screen.findByText(/^extra/)).toBeDefined();
});

test("keeps an account the daemon no longer declares, and says it does not", async () => {
  serving(
    [
      aDestination({
        kind: "webdav",
        settings: { account: "retired-last-week", root: "Notes" },
      }),
    ],
    {
      "GET /v1/destination-kinds": () =>
        json(200, { values: [webdavKind(["home", "work"])] }),
    },
  );

  render(Destinations);
  await open("Vault");
  await press("edit");

  // Opening the form must not move the destination to whichever name sorts first.
  await screen.findByRole("button", {
    name: "retired-last-week — not declared",
  });
});

test("checks a root nothing has used before, and writes nothing until confirmed", async () => {
  serving([]);

  render(Destinations);
  await press("+ add a destination");

  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/second-brain" },
  });

  await screen.findByText(/notemap has not used/);
  expect(screen.queryByRole("button", { name: "create" })).toBeNull();
  expect(asked()).not.toContain("POST /v1/destinations");

  await press("use it anyway");
  await screen.findByRole("button", { name: "Second brain" });
  expect(asked()).toContain("POST /v1/destinations");
});

test("asks nothing for a root already under one notemap holds", async () => {
  serving([aDestination({ settings: { root: "~/notes" } })]);

  render(Destinations);
  await screen.findByRole("button", { name: "Vault" });
  await press("+ add a destination");

  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/notes/second-brain" },
  });

  expect(screen.queryByText(/notemap has not used/)).toBeNull();
  await press("create");

  await screen.findByRole("button", { name: "Second brain" });
});

test("disables one, and offers it again", async () => {
  serving([aDestination()]);

  render(Destinations);
  await open("Vault");
  await press("disable");

  // A disabled destination is hidden from the ordinary list; showing it
  // brings back the row, still open, so it can be enabled again.
  await press("1 disabled · show");
  await press("enable");

  await screen.findByRole("button", { name: "disable" });
  expect(asked()).toContain(`POST /v1/destinations/${VAULT}/retire`);
  expect(asked()).toContain(`POST /v1/destinations/${VAULT}/unretire`);
});

/** The one thing here that cannot be undone, so the one thing that asks first. */
test("asks before deleting, in the actions line, and offers the reversible half instead", async () => {
  serving([aDestination()], {
    [`DELETE /v1/destinations/${VAULT}`]: () =>
      json(409, { error: { code: "destination-in-use", destination: VAULT } }),
  });

  render(Destinations);
  await open("Vault");
  await press("delete");

  expect(await screen.findByText("Delete Vault?")).toBeDefined();
  expect(asked()).not.toContain(`DELETE /v1/destinations/${VAULT}`);

  await press("delete");
  // Only the pool knows whether a record has ever named it, so its refusal is
  // the answer — and it lands where the alternative it leaves is already on screen.
  await screen.findByText(/retire it instead/);
  expect(screen.getByRole("button", { name: "disable instead" })).toBeDefined();
});

test("keeps the ask open under a click inside it, and `keep` turns it back", async () => {
  serving([aDestination()]);

  render(Destinations);
  await open("Vault");
  await press("delete");

  await fireEvent.click(await screen.findByText("Delete Vault?"));
  expect(screen.getByText("Delete Vault?")).toBeDefined();

  await press("keep");
  expect(screen.queryByText("Delete Vault?")).toBeNull();
  expect(screen.getByRole("button", { name: "delete" })).toBeDefined();
});

test("the edit form replaces the actions, holds under a click on its label, and `cancel` restores them", async () => {
  serving([aDestination()]);

  render(Destinations);
  await open("Vault");
  await press("edit");

  const form = await screen.findByRole("textbox", { name: "Name" });
  expect(screen.queryByRole("button", { name: "delete" })).toBeNull();

  // The label is no control, so the row's own click-to-open would have taken
  // this as a toggle and thrown the form away with whatever was typed.
  await fireEvent.input(form, { target: { value: "Vault renamed" } });
  await fireEvent.click(screen.getByText("name"));
  expect(screen.getByRole("textbox", { name: "Name" })).toBe(form);
  expect((form as HTMLInputElement).value).toBe("Vault renamed");

  await press("cancel");
  expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  expect(screen.getByRole("button", { name: "delete" })).toBeDefined();
});

test("deletes one nothing has ever named", async () => {
  serving([aDestination()], {
    [`DELETE /v1/destinations/${VAULT}`]: () =>
      new Response(null, { status: 204 }),
  });

  render(Destinations);
  await open("Vault");
  await press("delete");
  await press("delete");

  await vi.waitFor(() => {
    expect(screen.queryByRole("button", { name: "Vault" })).toBeNull();
  });
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
    expect(disabled("edit")).toBe(true);
  });
  expect(disabled("disable")).toBe(true);
  expect(disabled("delete")).toBe(true);
  expect(disabled("+ add a destination")).toBe(true);

  // Checking is a read, so it survives what the changes do not.
  expect(disabled("check again")).toBe(false);
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
      name: "+ add a destination",
    }) as HTMLButtonElement;

  await vi.waitFor(() => expect(adding().disabled).toBe(true));

  serving([]);
  online(true);

  await vi.waitFor(() => expect(adding().disabled).toBe(false));
});
