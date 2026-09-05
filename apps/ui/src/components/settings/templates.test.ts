import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { online } from "$testing/dom";
import { asked, pool, sent } from "$testing/pool";
import Templates from "./Templates.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";
const RESEARCH = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a80";

const CREATE_FILE = {
  name: "create-file",
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
    capability: "create-file",
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
      return json(200, { kind: "described", capabilities: [CREATE_FILE] });
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

  expect(await screen.findByText("create-file")).toBeTruthy();
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
    capability: "create-file",
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
      return json(200, { kind: "described", capabilities: [CREATE_FILE] });
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
