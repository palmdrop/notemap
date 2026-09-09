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

test("offers the pool's tags in use as words beside what is applied", async () => {
  await serving(["reading", "seedling"]);
  draw(["seedling"]);

  await vi.waitFor(() => expect(word("reading")).toBeDefined());

  expect(word("seedling").getAttribute("aria-pressed")).toBe("true");
  expect(word("reading").getAttribute("aria-pressed")).toBe("false");
});

test("a tag taken here reaches the pool", async () => {
  await serving(["reading"]);
  draw();

  await vi.waitFor(() => expect(word("reading")).toBeDefined());
  await fireEvent.click(word("reading"));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  expect(word("reading").getAttribute("aria-pressed")).toBe("true");
});

test("a tag taken back is removed", async () => {
  await serving(["reading"]);
  draw(["reading"]);

  await vi.waitFor(() => expect(word("reading")).toBeDefined());
  await fireEvent.click(word("reading"));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/untag");
  });
});

test("takes a tag the pool has never seen", async () => {
  await serving([]);
  draw();

  await fireEvent.click(screen.getByLabelText("Add a tag"));
  const input = screen.getByLabelText("Add a tag") as HTMLInputElement;
  await fireEvent.input(input, { target: { value: "brand-new" } });
  await fireEvent.blur(input);

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
});

test("narrows what is offered as a name is typed", async () => {
  await serving(["reading", "recipe", "seedling"]);
  draw();

  await vi.waitFor(() => expect(word("reading")).toBeDefined());
  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  await fireEvent.input(screen.getByRole("textbox", { name: "Add a tag" }), {
    target: { value: "re" },
  });

  expect(word("reading")).toBeDefined();
  expect(word("recipe")).toBeDefined();
  expect(screen.queryByRole("button", { name: "seedling" })).toBeNull();
});

/** A tag the item carries is its state, not a suggestion: hiding it reads as dropped. */
test("keeps what is applied visible however the filter narrows", async () => {
  await serving(["reading", "seedling"]);
  draw(["seedling"]);

  await vi.waitFor(() => expect(word("reading")).toBeDefined());
  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  await fireEvent.input(screen.getByRole("textbox", { name: "Add a tag" }), {
    target: { value: "re" },
  });

  expect(word("seedling").getAttribute("aria-pressed")).toBe("true");
});

/** Taking one is answered at once, so dropping one has to be too. */
test("stops saying a tag is applied the moment it is dropped", async () => {
  await serving(["seedling"]);
  draw(["seedling"]);

  await vi.waitFor(() =>
    expect(word("seedling").getAttribute("aria-pressed")).toBe("true"),
  );

  await fireEvent.click(word("seedling"));
  expect(word("seedling").getAttribute("aria-pressed")).toBe("false");
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

  await fireEvent.click(
    await screen.findByRole("button", { name: /research/ }),
  );

  expect(fired).toHaveBeenCalled();
});

test("says nothing of an ordinary tag, which files nothing", async () => {
  await serving(["reading"], [RESEARCH]);
  const fired = vi.fn();
  draw([], fired);

  await fireEvent.click(await screen.findByRole("button", { name: "reading" }));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  expect(fired).not.toHaveBeenCalled();
});
