import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import ComposerTags from "./ComposerTags.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const RESEARCH = {
  id: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a80",
  name: "research",
  destination: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
  capability: "create",
  arguments: { directory: "research" },
  folder: "create",
  triggerTag: "route/research",
};

/** The layout is what fills `inUse` in the running shell, so a test does it too. */
async function serving(
  inUse: readonly string[],
  templates: readonly Record<string, unknown>[] = [],
) {
  const transport = pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/tags") {
      return json(200, { values: inUse.map((name) => ({ name, items: 1 })) });
    }
    if (route === "GET /v1/templates") return json(200, { values: templates });
    if (route === "GET /v1/items/one/routing") return json(200, { values: [] });
    return json(200, {});
  });

  await client.tags.load();
  await client.templates.load();
  return transport;
}

function draw(names: readonly string[] = [], onfired?: () => void) {
  render(ComposerTags, {
    props: {
      item: "one",
      names,
      ...(onfired === undefined ? {} : { onfired }),
    },
  });
}

const word = (name: string) => screen.getByRole("button", { name });

const opened = async () => {
  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  return screen.getByRole("combobox", { name: "Add a tag" });
};

test("draws what is applied as pressed words, and offers the rest beneath the line", async () => {
  await serving(["reading", "seedling"]);
  draw(["seedling"]);

  expect(word("seedling").getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("button", { name: "reading" })).toBeNull();

  await opened();
  expect(screen.getByRole("option", { name: "reading" })).toBeDefined();
  expect(screen.queryByRole("option", { name: "seedling" })).toBeNull();
});

test("a tag taken here reaches the pool", async () => {
  await serving(["reading"]);
  draw();

  await opened();
  await fireEvent.mouseDown(screen.getByRole("option", { name: "reading" }));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
});

test("a tag taken back is removed", async () => {
  await serving(["reading"]);
  draw(["reading"]);

  await fireEvent.click(word("reading"));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/untag");
  });
});

test("takes a tag the pool has never seen", async () => {
  await serving([]);
  draw();

  const line = await opened();
  await fireEvent.input(line, { target: { value: "brand-new" } });
  await fireEvent.keyDown(line, { key: "Enter" });

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
});

/**
 * A trigger tag files the item the moment it is taken, so whoever is holding a
 * half-made decision beside this row is told before they can press it into a
 * second copy.
 */
test("says a trigger tag taken here filed the item", async () => {
  await serving(["route/research"], [RESEARCH]);
  const fired = vi.fn();
  draw([], fired);

  await opened();
  await fireEvent.mouseDown(
    screen.getByRole("option", { name: /route\/research/ }),
  );

  expect(fired).toHaveBeenCalled();
});

test("says nothing of an ordinary tag, which files nothing", async () => {
  await serving(["reading"], [RESEARCH]);
  const fired = vi.fn();
  draw([], fired);

  await opened();
  await fireEvent.mouseDown(screen.getByRole("option", { name: "reading" }));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  expect(fired).not.toHaveBeenCalled();
});
