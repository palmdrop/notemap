import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { asked as sentTo, json, routeOf } from "@notemap/client/testing";

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

const CREATE_FILE_ASKABLE = {
  name: "create-file",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["directory"],
    properties: {
      directory: { type: "string", "x-notemap-candidates": true },
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

/**
 * A destination whose `create-file` capability's `directory` can be browsed.
 * The kind is one nothing registers a control for, so this draws the
 * schema-driven browser; the kinds that hold a filesystem draw the typed line
 * and are exercised in `PathLine.test.ts`.
 */
function servingBrowsable(
  answerAt: (scope: string | undefined) => Record<string, unknown>,
  kind = "kanban",
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind })] });
    }
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [CREATE_FILE_ASKABLE],
      });
    }
    if (route.endsWith("/candidates")) {
      const scope = new URL(request.url).searchParams.get("scope") ?? undefined;
      return json(200, answerAt(scope));
    }
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

test("browses a field that can be asked about, and takes the scope stood in", async () => {
  servingBrowsable((scope) =>
    scope === undefined
      ? {
          kind: "answered",
          entries: [{ label: "inbox", value: "inbox", scope: "inbox" }],
          truncated: false,
        }
      : {
          kind: "answered",
          entries: [{ label: "drafts", value: `${scope}/drafts` }],
          truncated: false,
        },
  );

  draw();
  await choose(/Vault/);
  await choose(/create-file/);

  await choose("inbox");
  await choose(/use inbox/);

  expect((screen.getByLabelText("directory") as HTMLInputElement).value).toBe(
    "inbox",
  );
});

test("a refusal to browse is not an alarm, and typing still works beside it", async () => {
  servingBrowsable(() => ({
    kind: "unreachable",
    detail: "the vault is not mounted",
  }));

  draw();
  await choose(/Vault/);
  await choose(/create-file/);

  await screen.findByText(/the vault is not mounted/);
  expect(screen.queryByRole("alert")).toBeNull();

  await fireEvent.input(screen.getByLabelText("directory"), {
    target: { value: "inbox" },
  });
  expect((screen.getByLabelText("directory") as HTMLInputElement).value).toBe(
    "inbox",
  );
});

test("a typed value that was never listed still routes", async () => {
  const transport = servingBrowsable(() => ({
    kind: "answered",
    entries: [],
    truncated: false,
  }));

  const closed = draw();
  await choose(/Vault/);
  await choose(/create-file/);

  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "brand-new-folder" },
  });
  await choose("route");

  await vi.waitFor(() => {
    expect(closed).toHaveBeenCalled();
  });

  const routed = sentTo(transport).find(
    (request) => routeOf(request) === "POST /v1/items/one/route",
  );
  const body = (await routed?.clone().json()) as {
    arguments: Record<string, unknown>;
  };
  expect(body.arguments).toEqual({ directory: "brand-new-folder" });
});

test("an unregistered kind gets the schema-driven control", async () => {
  servingBrowsable(() => ({
    kind: "answered",
    entries: [{ label: "inbox", value: "inbox" }],
    truncated: false,
  }));

  draw();
  await choose(/Vault/);
  await choose(/create-file/);

  expect(await screen.findByRole("button", { name: "inbox" })).toBeDefined();
  expect(screen.queryByRole("combobox")).toBeNull();
});

/** The seam decides on the kind alone, and a filesystem-shaped one draws the line. */
test("a kind that holds a filesystem gets the typed line instead", async () => {
  servingBrowsable(
    () => ({
      kind: "answered",
      entries: [{ label: "inbox", value: "inbox" }],
      truncated: false,
    }),
    "filesystem",
  );

  draw();
  await choose(/Vault/);
  await choose(/create-file/);

  expect(await screen.findByRole("combobox")).toBeDefined();
  expect(screen.queryByRole("button", { name: "inbox" })).toBeNull();
});

const answered = (entries: readonly Record<string, unknown>[]) => ({
  kind: "answered",
  entries,
  truncated: false,
});

test("walks through an entry that is only somewhere to look, and takes the one past it", async () => {
  servingBrowsable((scope) =>
    scope === undefined
      ? answered([{ label: "projects", scope: "projects" }])
      : answered([{ label: "fiction.md", value: "projects/fiction.md" }]),
  );

  draw();
  await choose(/Vault/);
  await choose(/create-file/);

  await choose("projects");
  await screen.findByRole("button", { name: "fiction.md" });

  // A scope the field may not hold is not offered as something to take.
  expect(screen.queryByRole("button", { name: /^use / })).toBeNull();
  expect((screen.getByLabelText("directory") as HTMLInputElement).value).toBe(
    "",
  );

  await choose("fiction.md");
  expect((screen.getByLabelText("directory") as HTMLInputElement).value).toBe(
    "projects/fiction.md",
  );
});

test("empties a field browsed to and then left, from the top and only there", async () => {
  servingBrowsable((scope) =>
    scope === undefined
      ? answered([{ label: "inbox", value: "inbox", scope: "inbox" }])
      : answered([]),
  );

  draw();
  await choose(/Vault/);
  await choose(/create-file/);
  await screen.findByRole("button", { name: "inbox" });

  expect(screen.queryByRole("button", { name: "clear" })).toBeNull();

  await choose("inbox");
  await choose(/use inbox/);
  await choose("back");
  await choose("clear");

  expect((screen.getByLabelText("directory") as HTMLInputElement).value).toBe(
    "",
  );
});

test("draws two entries that share a label", async () => {
  servingBrowsable(() =>
    answered([
      { label: "notes", value: "a/notes", scope: "a/notes" },
      { label: "notes", value: "b/notes", scope: "b/notes" },
    ]),
  );

  draw();
  await choose(/Vault/);
  await choose(/create-file/);

  expect(await screen.findAllByRole("button", { name: "notes" })).toHaveLength(
    2,
  );
});

test("drops an answer for a scope it has already left", async () => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  pool(async (request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "kanban" })] });
    }
    if (route.endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [CREATE_FILE_ASKABLE],
      });
    }
    if (route.endsWith("/candidates")) {
      if (new URL(request.url).searchParams.get("scope") === null) {
        return json(
          200,
          answered([{ label: "inbox", value: "inbox", scope: "inbox" }]),
        );
      }
      await held;
      return json(200, answered([{ label: "buried", value: "inbox/buried" }]));
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  draw();
  await choose(/Vault/);
  await choose(/create-file/);

  // Descend into an answer that hangs, then leave before it lands.
  await choose("inbox");
  await choose("back");
  await screen.findByRole("button", { name: "inbox" });

  release();
  await held;
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(screen.queryByRole("button", { name: "buried" })).toBeNull();
  expect(screen.getByRole("button", { name: "inbox" })).toBeDefined();
});
