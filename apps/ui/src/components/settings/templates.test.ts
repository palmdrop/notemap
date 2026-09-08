import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { online } from "$testing/dom";
import { asked, pool, sent } from "$testing/pool";
import Templates from "./Templates.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";
const RESEARCH = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a80";

const CREATE = {
  name: "create",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["directory"],
    properties: {
      directory: { type: "string" },
      folder: { type: "string", enum: ["create", "require"] },
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

function aTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: RESEARCH,
    name: "research",
    destination: VAULT,
    capability: "create",
    arguments: { directory: "research/{{captured_at}}" },
    folder: "create",
    triggerTag: "route/research",
    fired: { records: 4, lastAt: "2026-09-05T10:00:00.000Z" },
    ...overrides,
  };
}

function serving(
  templates: readonly Record<string, unknown>[],
  report: Record<string, unknown> = { kind: "fits" },
  destinations: readonly Record<string, unknown>[] = [aDestination()],
) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: destinations });
    }
    if (route === "GET /v1/templates") {
      return json(200, { values: templates });
    }
    if (route.endsWith("/report")) return json(200, report);
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE] });
    }
    if (route === "POST /v1/templates") return json(201, aTemplate());
    if (route === `DELETE /v1/templates/${RESEARCH}`) {
      return new Response(null, { status: 204 });
    }
    if (route === `PATCH /v1/templates/${RESEARCH}`) {
      return json(200, aTemplate({ name: "reading" }));
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

const open = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

/** What a fact says, read off its own label: two facts may hold one word. */
const said = async (fact: string) =>
  (await screen.findByText(fact)).nextElementSibling?.textContent?.trim();

test("draws each template with its tag, its place and what it last answered", async () => {
  serving([aTemplate()]);

  render(Templates);

  await screen.findByRole("button", { name: /research/ });
  expect(screen.getByText("route/research")).toBeTruthy();
  expect(screen.getByText("research/{{captured_at}}")).toBeTruthy();
  await vi.waitFor(() => {
    expect(screen.getByText(/fits/)).toBeTruthy();
  });
});

test("asks each row for its own report, and asks a settled one once", async () => {
  serving([aTemplate(), aTemplate({ id: "second", name: "daily" })]);

  render(Templates);

  await vi.waitFor(() => {
    expect(asked().filter((each) => each.endsWith("/report"))).toEqual([
      `GET /v1/templates/${RESEARCH}/report`,
      "GET /v1/templates/second/report",
    ]);
  });

  // Settled answers are not asked again, however often the list redraws.
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(asked().filter((each) => each.endsWith("/report")).length).toBe(2);
});

test("a template whose destination is gone leads with that and offers repointing", async () => {
  serving([aTemplate({ destination: "deleted" })], { kind: "stranded" });

  render(Templates);

  await screen.findByText("Does nothing until repointed.");
  await open(/research/);
  expect(await screen.findByRole("button", { name: /Repoint/ })).toBeTruthy();
});

test("a destination that cannot be asked draws no accent", async () => {
  serving([aTemplate()], { kind: "unreachable", detail: "ECONNREFUSED" });

  render(Templates);

  const said = await screen.findByText("not reachable");
  expect(said.className).toContain("text-ink-muted");
  expect(said.className).not.toContain("text-accent");
});

test("a missing folder is drawn as a thing to act on, and named", async () => {
  serving([aTemplate({ folder: "require" })], {
    kind: "folder-missing",
    folder: "research/",
  });

  render(Templates);

  const said = await screen.findByText(/research\/ missing/);
  expect(said.className).toContain("text-accent");
});

test("opening one says what it does, into what, and how much it has", async () => {
  serving([aTemplate()]);

  render(Templates);
  await open(/research/);

  // By the fact it sits under: `create` is the capability here and a folder
  // mode two rows down, and a bare text query cannot tell them apart.
  expect(await said("action")).toBe("create");
  expect(screen.getByText(/4 items/)).toBeTruthy();
});

test("makes one from the form, and the arguments are typed as patterns", async () => {
  serving([]);

  render(Templates);
  await open(/Make a template/);

  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "Research links" },
  });
  await fireEvent.input(screen.getByLabelText("trigger tag"), {
    target: { value: "research" },
  });
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "research/{{captured_at}}" },
  });
  await open("Save");

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/templates");
  });
  expect(await sent()).toContainEqual({
    name: "Research links",
    destination: VAULT,
    capability: "create",
    arguments: { directory: "research/{{captured_at}}" },
    folder: "create",
    triggerTag: "route/research",
  });
});

test("says what the pool refused about a pattern, where it was typed", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination()] });
    }
    if (route === "GET /v1/templates") return json(200, { values: [] });
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [CREATE] });
    }
    if (route === "POST /v1/templates") {
      return json(422, {
        error: { code: "unknown-pattern-field", field: "captured" },
      });
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  render(Templates);
  await open(/Make a template/);
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "research/{{captured}}" },
  });
  await open("Save");

  expect(await screen.findByText(/there is no "captured"/)).toBeTruthy();
});

test("deleting asks in a line, and says what a record keeps", async () => {
  serving([aTemplate()]);

  render(Templates);
  await open(/research/);
  await open(/Delete/);

  expect(
    await screen.findByText(/Records made from it keep resolving/),
  ).toBeTruthy();

  await open(/× Delete/);
  await vi.waitFor(() => {
    expect(asked()).toContain(`DELETE /v1/templates/${RESEARCH}`);
  });
});

test("says templates can be read but not changed while the pool is away", async () => {
  serving([aTemplate()]);
  online(false);

  render(Templates);

  expect(
    await screen.findByText("Templates can be read but not changed."),
  ).toBeTruthy();
  online(true);
});

/**
 * A destination whose places are a fixed set, and which has no folders at all.
 * The form is built from what the capability published, so none of this is a
 * case the shell was told about.
 */
const ADD_CARD = {
  name: "add-card",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["column"],
    properties: {
      column: { type: "string", enum: ["reading", "done"] },
      title: { type: "string" },
    },
  },
};

function servingBoard(templates: readonly Record<string, unknown>[] = []) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "board" })] });
    }
    if (route === "GET /v1/templates") {
      return json(200, { values: templates });
    }
    if (route.endsWith("/report")) return json(200, { kind: "fits" });
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [ADD_CARD] });
    }
    if (route === "POST /v1/templates") return json(201, aTemplate());
    return json(404, { error: { code: "unknown-route" } });
  });
}

test("a field the schema fixes is chosen rather than typed", async () => {
  servingBoard();

  render(Templates);
  await open(/Make a template/);

  // The values the capability declared, offered; and no box to mistype one in.
  expect(await screen.findByRole("button", { name: "reading" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "done" })).toBeTruthy();
  expect(screen.queryByLabelText("column")).toBeNull();

  // A field the schema leaves open is still typed, patterns and all.
  expect(screen.getByLabelText("title")).toBeTruthy();
});

test("a capability with no folders is offered no folder mode", async () => {
  servingBoard();

  render(Templates);
  await open(/Make a template/);

  await screen.findByRole("button", { name: "reading" });
  expect(screen.queryByRole("button", { name: /^establish/ })).toBeNull();
  expect(screen.queryByText("folder")).toBeNull();
});

test("saves what was chosen, and says create where there are no folders", async () => {
  servingBoard();

  render(Templates);
  await open(/Make a template/);

  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "Reading list" },
  });
  await open("reading");
  await fireEvent.input(screen.getByLabelText("title"), {
    target: { value: "{{captured_at}}" },
  });
  await open("Save");

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/templates");
  });
  expect(await sent()).toContainEqual({
    name: "Reading list",
    destination: VAULT,
    capability: "add-card",
    arguments: { column: "reading", title: "{{captured_at}}" },
    folder: "create",
  });
});

/**
 * The three modes were drawn with the prop that says an option cannot be taken,
 * so every one of them was disabled and the mode was whatever it started as.
 */
test("the folder mode is chosen rather than only read", async () => {
  serving([]);

  render(Templates);
  await open(/Make a template/);

  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "Research links" },
  });
  await fireEvent.input(await screen.findByLabelText("directory"), {
    target: { value: "research" },
  });
  await open(/^establish/);
  await open("Save");

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/templates");
  });
  expect(await sent()).toContainEqual({
    name: "Research links",
    destination: VAULT,
    capability: "create",
    arguments: { directory: "research" },
    folder: "establish",
  });
});

/** The same fields twice, one settled and one being changed, contradict each other. */
test("editing draws the form alone, not the template beside it", async () => {
  serving([aTemplate()]);

  render(Templates);
  await open(/research/);
  expect(await said("action")).toBe("create");

  await open("Edit");

  // A fact the form has no counterpart for; `action` and `folder` are both
  // words the form uses too.
  expect(screen.queryByText("fired")).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  expect(await screen.findByLabelText("name")).toBeTruthy();
});

test("draws a board template's place without knowing what a place is", async () => {
  servingBoard([
    aTemplate({
      capability: "add-card",
      arguments: { column: "reading", title: "{{captured_at}}" },
    }),
  ]);

  render(Templates);

  // Every string the arguments hold, in the order the destination declared
  // them — never a field name this shell had to be told.
  await screen.findByText("reading · {{captured_at}}");
});

/**
 * A destination whose places are neither a path nor a fixed set: a list only
 * the account can answer, picked from rather than created, and flat. The form
 * asks the destination and offers what came back, and the field stays typable
 * because a template's value may be a pattern.
 */
const PUBLISH = {
  name: "publish",
  accepts: ["text"],
  argumentsSchema: {
    type: "object",
    required: ["channel"],
    properties: {
      channel: {
        type: "string",
        title: "channel",
        "x-notemap-candidates": true,
      },
    },
  },
};

function servingChannels(entries: readonly Record<string, unknown>[]) {
  return pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "arena" })] });
    }
    if (route === "GET /v1/templates") return json(200, { values: [] });
    if (route.endsWith("/candidates")) {
      return json(200, { kind: "answered", entries, truncated: false });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [PUBLISH] });
    }
    if (route === "POST /v1/templates") return json(201, aTemplate());
    return json(404, { error: { code: "unknown-route" } });
  });
}

test("asks the destination what a browsable field could hold, and offers it", async () => {
  servingChannels([
    { label: "reading", value: "reading" },
    { label: "field recordings", value: "field-recordings" },
  ]);

  render(Templates);
  await open(/Make a template/);

  // Rows rather than buttons now, as the typed line's are, so `↑↓` can walk
  // them without moving focus off the field.
  await screen.findByText("reading");
  expect(screen.getByText("field recordings")).toBeTruthy();
});

test("taking one fills the field, and the field is still typed into", async () => {
  servingChannels([{ label: "reading", value: "reading" }]);

  render(Templates);
  await open(/Make a template/);
  await fireEvent.mouseDown(await screen.findByText("reading"));

  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  expect(field.value).toBe("reading");

  // A place that has to be picked from what is there and one that has to be
  // written are the same field: a template's value may hold a pattern.
  await fireEvent.input(field, { target: { value: "{{source}}" } });
  expect(field.value).toBe("{{source}}");
});

test("a destination that cannot be asked leaves the field typable", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/destinations") {
      return json(200, { values: [aDestination({ kind: "arena" })] });
    }
    if (route === "GET /v1/templates") return json(200, { values: [] });
    if (route.endsWith("/candidates")) {
      return json(200, { kind: "unreachable", detail: "ECONNREFUSED" });
    }
    if (route.endsWith("/description")) {
      return json(200, { kind: "described", capabilities: [PUBLISH] });
    }
    return json(404, { error: { code: "unknown-route" } });
  });

  render(Templates);
  await open(/Make a template/);

  const field = (await screen.findByLabelText("channel")) as HTMLInputElement;
  await fireEvent.input(field, { target: { value: "reading" } });
  expect(field.value).toBe("reading");
});
