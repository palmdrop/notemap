import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { online } from "$testing/dom";
import { asked, client, pool, sent } from "$testing/pool";
import Destinations from "./Destinations.svelte";
import { address } from "$testing/address.svelte";
import { follow } from "$testing/router";

vi.mock("$app/state", () => import("$testing/address.svelte"));
vi.mock("$app/navigation", () => import("$testing/router"));

follow();
beforeEach(() => {
  address.path = "/settings/destinations";
});

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

/** A destination opens on a page of its own, from its row in the list. */
async function open(name: string) {
  return fireEvent.click(await screen.findByRole("link", { name }));
}

const go = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("link", { name }));

const press = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

test("lists what the pool holds, each saying where it stands", async () => {
  serving(
    [aDestination(), aDestination({ id: "b", name: "Board", retired: true })],
    {
      [`GET /v1/destinations/${VAULT}/description`]: () => described(),
      [`GET /v1/destinations/${VAULT}/probe`]: () =>
        json(200, { kind: "ready" }),
    },
  );

  render(Destinations);
  const vault = await screen.findByRole("link", { name: "Vault" });
  const board = screen.getByRole("link", { name: "Board" });
  expect(board.textContent).toContain("disabled");

  // The list still fills from pool state alone; both questions follow it.
  await vi.waitFor(() => expect(vault.textContent).toContain("available"));
  expect(asked().sort()).toEqual([
    "GET /v1/destination-kinds",
    "GET /v1/destinations",
    `GET /v1/destinations/${VAULT}/description`,
    `GET /v1/destinations/${VAULT}/probe`,
  ]);
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

  await screen.findByText("new note");
});

test("says a destination is not really there, though it describes itself fine", async () => {
  serving([aDestination()], {
    [`GET /v1/destinations/${VAULT}/description`]: () => described(),
    [`GET /v1/destinations/${VAULT}/probe`]: () =>
      json(200, { kind: "rejected", detail: "~/notes is not there" }),
  });

  render(Destinations);
  const vault = await screen.findByRole("link", { name: "Vault" });
  await vi.waitFor(() => expect(vault.textContent).toContain("unavailable"));

  await open("Vault");
  await screen.findByText(/~\/notes is not there/);
});

test("says nothing at all where the kind cannot be probed", async () => {
  serving([aDestination()], {
    [`GET /v1/destinations/${VAULT}/description`]: () => described(),
    [`GET /v1/destinations/${VAULT}/probe`]: () =>
      json(200, { kind: "not-offered" }),
  });

  render(Destinations);

  await screen.findByText(/available/);
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

  await screen.findByText("unusable");
  await screen.findByText("available");
  await open("Vault");
  await screen.findByText(/the drive is not mounted/);
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
  await screen.findByText("unavailable");
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
  await screen.findByText("unavailable");

  // The list re-emitting is what re-runs the asking, so it is what must not.
  await client.destinations.load();
  await vi.waitFor(() => expect(asked()).toContain("GET /v1/destinations"));
  expect(answers).toBe(1);
});

/**
 * The call that can hang is the one that must say it is running: describing
 * answers at once, so a row whose probe is still out used to read "unasked".
 */
test("says a destination is being checked while its probe is still out", async () => {
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
  await screen.findByText("new note");
  expect(await screen.findByText(/Checking Vault/)).toBeDefined();

  answer?.(json(200, { kind: "ready" }));
  await screen.findByText(/Available\./);
});

test("keeps a destination's doings on its own page", async () => {
  serving([aDestination()]);

  render(Destinations);
  await screen.findByRole("link", { name: "Vault" });
  expect(screen.queryByRole("button", { name: /^Disable/ })).toBeNull();

  await open("Vault");
  expect(await screen.findByRole("button", { name: /^Disable/ })).toBeDefined();
  expect(address.path).toBe(`/settings/destinations?open=${VAULT}`);
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
  await press("Check again");

  await screen.findByText("new note");
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
  await press("Check again");

  await vi.waitFor(() =>
    expect(
      screen.getAllByText(/nothing here speaks the kanban kind/).length,
    ).toBeGreaterThan(0),
  );
  expect(screen.getByText("unusable:")).toBeDefined();
});

test("adds one from the kind's own schema", async () => {
  serving([]);

  render(Destinations);
  await go("Add a destination");

  // The fields are the kind's, not this component's.
  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/second-brain" },
  });
  await press("Save");

  await screen.findByRole("link", { name: "Second brain" });

  const created = asked().filter((route) => route === "POST /v1/destinations");
  expect(created).toHaveLength(1);
});

/**
 * A field named `profile` is a box nobody can fill in from the name alone. What
 * says an account is meant, and that it is one the daemon's config declares, is
 * the kind's own description of the field, so the form has to show it.
 */
test("draws a field's label, its control, and what the kind says of it", async () => {
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
  await go("Add a destination");

  await screen.findByRole("textbox", { name: "profile" });
  expect(
    screen.getByText("The name of an account in the configuration."),
  ).toBeDefined();
});

test("shows an optional field's placeholder while it is empty, and sends nothing for it", async () => {
  serving([], {
    "GET /v1/destination-kinds": () =>
      json(200, {
        values: [
          {
            name: "filesystem",
            settingsSchema: {
              type: "object",
              properties: {
                root: {
                  type: "string",
                  "x-notemap-placeholder": "/path/to/vault",
                },
              },
            },
          },
        ],
      }),
  });

  render(Destinations);
  await go("Add a destination");

  const root = await screen.findByRole("textbox", { name: "root" });
  expect(root.getAttribute("placeholder")).toBe("/path/to/vault");

  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Vault" },
  });
  await press("Save");

  await vi.waitFor(async () =>
    expect(await sent()).toContainEqual({
      name: "Vault",
      kind: "filesystem",
      settings: {},
    }),
  );
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
  await go("Add a destination");

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
  await go("Add a destination");

  // Unset, the kind's default is drawn as the picked option; there is no
  // "default (none)" of its own.
  const none = await screen.findByRole("button", { name: "none" });
  expect(none.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "full" })).toBeDefined();
  expect(screen.queryByRole("button", { name: /^default/ })).toBeNull();
});

/** A boolean setting is two options under a person's words, and a chosen `no` is sent as one. */
test("chooses a boolean setting as yes or no, drawing the default as picked and sending nothing for it", async () => {
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
  await go("Add a destination");

  expect(
    (await screen.findByRole("button", { name: "no" })).getAttribute(
      "aria-pressed",
    ),
  ).toBe("true");
  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/second-brain" },
  });
  // The default, already drawn as picked, leaves the field unset.
  await press("no");
  await press("Save");

  await vi.waitFor(async () => {
    expect(await sent()).toContainEqual({
      name: "Second brain",
      kind: "filesystem",
      settings: { root: "~/second-brain" },
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
  await go("Add a destination");
  await screen.findByRole("button", { name: "no" });

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
  await go("Edit");

  // Opening the form must not move the destination to whichever name sorts first.
  const held = await screen.findByRole("radio", {
    name: "retired-last-week — not declared",
  });
  expect(held.getAttribute("aria-checked")).toBe("true");
});

test("checks a root nothing has used before, and writes nothing until confirmed", async () => {
  serving([]);

  render(Destinations);
  await go("Add a destination");

  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/second-brain" },
  });

  await screen.findByText(/notemap has not used/);
  expect(asked()).not.toContain("POST /v1/destinations");

  await press("Save");
  await screen.findByRole("link", { name: "Second brain" });
  expect(asked()).toContain("POST /v1/destinations");
});

test("asks nothing for a root already under one notemap holds", async () => {
  serving([aDestination({ settings: { root: "~/notes" } })]);

  render(Destinations);
  await screen.findByRole("link", { name: "Vault" });
  await go("Add a destination");

  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/notes/second-brain" },
  });

  expect(screen.queryByText(/notemap has not used/)).toBeNull();
  await press("Save");

  await screen.findByRole("link", { name: "Second brain" });
});

test("disables one, and offers it again", async () => {
  serving([aDestination()]);

  render(Destinations);
  await open("Vault");
  await press(/^Disable/);
  await press(/^Enable/);

  await screen.findByRole("button", { name: /^Disable/ });
  expect(asked()).toContain(`POST /v1/destinations/${VAULT}/retire`);
  expect(asked()).toContain(`POST /v1/destinations/${VAULT}/unretire`);
});

/** The one thing here that cannot be undone, so the one thing that asks first. */
test("asks before deleting, in a dialog, and offers the reversible half instead", async () => {
  serving([aDestination()], {
    [`DELETE /v1/destinations/${VAULT}`]: () =>
      json(409, { error: { code: "destination-in-use", destination: VAULT } }),
  });

  render(Destinations);
  await open("Vault");
  await press(/^Delete…/);

  expect(await screen.findByText("Delete Vault?")).toBeDefined();
  expect(asked()).not.toContain(`DELETE /v1/destinations/${VAULT}`);

  await press("Delete");
  // Only the pool knows whether a record has ever named it, so its refusal is
  // the answer, and it lands beside the alternative it leaves.
  await screen.findByText(/retire it instead/);
  expect(screen.getByRole("button", { name: "Disable instead" })).toBeDefined();
});

test("Keep turns the ask back", async () => {
  serving([aDestination()]);

  render(Destinations);
  await open("Vault");
  await press(/^Delete…/);
  expect(await screen.findByText("Delete Vault?")).toBeDefined();

  await press("Keep");
  expect(screen.queryByText("Delete Vault?")).toBeNull();
  expect(asked()).not.toContain(`DELETE /v1/destinations/${VAULT}`);
});

test("the edit form is a page of its own, and Cancel goes back to the destination", async () => {
  serving([aDestination()]);

  render(Destinations);
  await open("Vault");
  await go("Edit");

  const form = await screen.findByRole("textbox", { name: "Name" });
  expect(screen.queryByRole("button", { name: /^Delete…/ })).toBeNull();
  expect((form as HTMLInputElement).value).toBe("Vault");

  await press("Cancel");
  expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  expect(await screen.findByRole("button", { name: /^Delete…/ })).toBeDefined();
});

test("deletes one nothing has ever named", async () => {
  serving([aDestination()], {
    [`DELETE /v1/destinations/${VAULT}`]: () =>
      new Response(null, { status: 204 }),
  });

  render(Destinations);
  await open("Vault");
  await press(/^Delete…/);
  await press("Delete");

  await vi.waitFor(() => {
    expect(asked()).toContain(`DELETE /v1/destinations/${VAULT}`);
  });
  await vi.waitFor(() => expect(address.path).toBe("/settings/destinations"));
});

/** Editing is online-only, and the interface makes that visible rather than queuing it. */
test("reads while the pool is unreachable, and holds every change", async () => {
  serving([aDestination()]);
  render(Destinations);
  await open("Vault");
  await screen.findByRole("button", { name: /^Disable/ });

  online(false);

  const held = (name: string | RegExp) => {
    const one = screen.getByRole(
      /^Edit$/.test(String(name)) ? "button" : "button",
      { name },
    ) as HTMLButtonElement;
    return one.disabled || one.getAttribute("aria-disabled") === "true";
  };

  await vi.waitFor(() => {
    expect(held("Edit")).toBe(true);
  });
  expect(held(/^Disable/)).toBe(true);
  expect(held(/^Delete…/)).toBe(true);
});

/** A screen opened while the daemon was down would otherwise have no form to add one with. */
test("asks again for the kinds once the daemon is reachable", async () => {
  online(false);
  serving([], {
    "GET /v1/destination-kinds": () => json(503, { error: { code: "x" } }),
  });
  render(Destinations);

  const adding = () =>
    screen.getByRole("button", { name: "Add a destination" });

  await vi.waitFor(() =>
    expect((adding() as HTMLButtonElement).disabled).toBe(true),
  );

  serving([]);
  online(true);

  await vi.waitFor(() =>
    expect(
      screen.getByRole("link", { name: "Add a destination" }),
    ).toBeDefined(),
  );
});

test("Save says what is missing until there is something to save", async () => {
  serving([]);
  render(Destinations);
  await go("Add a destination");

  expect(await screen.findByText("Name it to save.")).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled"),
  ).toBe("true");

  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  expect(await screen.findByText(/^Fill in root to save\.$/)).toBeDefined();
});

test("a default picked again after another is pinned, not unset", async () => {
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
  await go("Add a destination");

  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/second-brain" },
  });
  await press("yes");
  await press("no");
  await press("Save");

  await vi.waitFor(async () => {
    expect(await sent()).toContainEqual({
      name: "Second brain",
      kind: "filesystem",
      settings: { root: "~/second-brain", hashtags: false },
    });
  });
});
