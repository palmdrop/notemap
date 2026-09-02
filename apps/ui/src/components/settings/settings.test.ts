import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { online } from "$testing/dom";
import { client, asked, pool } from "$testing/pool";
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
    capabilities: [{ name: "create-file", accepts: [], argumentsSchema: {} }],
  });

/** Processing a destination happens on the row, which opens on its own name. */
async function open(name: string) {
  return fireEvent.click(await screen.findByRole("button", { name }));
}

const press = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

test("lists what the pool holds, and asks each offered one about itself", async () => {
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
  await screen.findByRole("button", { name: "Board" });

  // Retired ones are shown as not offered rather than hidden, and the section
  // says how the two split.
  expect(screen.getByText("1 offered \u00b7 1 retired")).toBeDefined();
  expect(screen.getByText(/offered to nothing new/)).toBeDefined();

  // The list still fills from pool state alone; both questions follow it.
  await screen.findByText(/reached/);
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
        capabilities: [
          { name: "create-file", accepts: [], argumentsSchema: {} },
        ],
      }),
  });

  render(Destinations);
  await open("Vault");

  await screen.findByText("create-file");
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
        capabilities: [
          { name: "create-file", accepts: [], argumentsSchema: {} },
        ],
      }),
  });

  render(Destinations);

  await screen.findByText(/the drive is not mounted/);
  await screen.findByText(/answered/);
});

/** Everything that can be done to one is behind opening it, as on a queue row. */
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
  await screen.findByText(/the drive is asleep/);
  expect(answers).toBe(1);

  transport.unreachable(true);
  online(false);
  await vi.waitFor(() => expect(screen.getByText(/read but not changed/)).toBeDefined());

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
  await screen.findByText("create-file");
  expect(screen.queryByText("unasked")).toBeNull();
  await screen.findByText("asking now");

  answer?.(json(200, { kind: "ready" }));
  await screen.findAllByText(/reached/);
});

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
        capabilities: [
          { name: "create-file", accepts: [], argumentsSchema: {} },
        ],
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
  // Nothing is known yet, so the button already says what it is about to do.
  await press("Use it anyway");

  await screen.findByRole("button", { name: "Second brain" });

  const created = asked().filter((route) => route === "POST /v1/destinations");
  expect(created).toHaveLength(1);
});

/**
 * A field named `profile` is a box nobody can fill in from the name alone. What
 * says an account is meant, and that it is one the daemon's config declares, is
 * the kind's own description of the field, so the form has to show it.
 */
test("shows what a kind says one of its fields is for", async () => {
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
  await press("Add a destination");

  expect(
    await screen.findByText("The name of an account in the configuration.", {
      selector: "p",
    }),
  ).toBeDefined();
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
  await press("Add a destination");

  const account = await screen.findByLabelText("account");
  expect(account.tagName).toBe("SELECT");
  expect(
    [...(account as HTMLSelectElement).options].map((one) => one.value),
  ).toEqual(["", "home", "work"]);

  // A daemon declaring no accounts must not trap a person behind an empty list.
  expect(screen.getByLabelText("root").tagName).toBe("INPUT");
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
  await press("Edit");

  const account = (await screen.findByLabelText(
    "account",
  )) as HTMLSelectElement;

  // Opening the form must not move the destination to whichever name sorts first.
  expect(account.value).toBe("retired-last-week");
  expect([...account.options].map((one) => one.textContent?.trim())).toContain(
    "retired-last-week \u2014 not declared",
  );
});

test("checks a root nothing has used before, and writes nothing until confirmed", async () => {
  serving([]);

  render(Destinations);
  await press("Add a destination");

  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/second-brain" },
  });

  await screen.findByText(/notemap has not used/);
  expect(screen.queryByRole("button", { name: "Create it" })).toBeNull();
  expect(asked()).not.toContain("POST /v1/destinations");

  await press("Use it anyway");
  await screen.findByRole("button", { name: "Second brain" });
  expect(asked()).toContain("POST /v1/destinations");
});

test("asks nothing for a root already under one notemap holds", async () => {
  serving([aDestination({ settings: { root: "~/notes" } })]);

  render(Destinations);
  await screen.findByRole("button", { name: "Vault" });
  await press("Add a destination");

  await fireEvent.input(screen.getByLabelText("Name"), {
    target: { value: "Second brain" },
  });
  await fireEvent.input(screen.getByLabelText("root"), {
    target: { value: "~/notes/second-brain" },
  });

  expect(screen.queryByText(/notemap has not used/)).toBeNull();
  await press("Create it");

  await screen.findByRole("button", { name: "Second brain" });
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

/** `asked()` drops health on purpose; this row is where it is the subject. */
const probes = (transport: { readonly sent: readonly Request[] }) =>
  transport.sent.map(routeOf).filter((route) => route === "GET /v1/health");

test("says the daemon is reachable without anyone pressing anything", async () => {
  const transport = serving([aDestination()]);

  render(Daemon);

  await screen.findByText("reachable");
  await screen.findByText(/just now/);
  expect(probes(transport).length).toBeGreaterThan(0);
});

test("asks again on request, out of the probe's own turn", async () => {
  const transport = serving([aDestination()]);

  render(Daemon);
  await screen.findByText("reachable");
  const before = probes(transport).length;

  await press("Check again");

  await vi.waitFor(() =>
    expect(probes(transport).length).toBeGreaterThan(before),
  );
});

test("says the daemon is unreachable rather than saying nothing", async () => {
  const transport = serving([aDestination()]);
  transport.unreachable(true);

  render(Daemon);

  await screen.findByText("unreachable");
});
