import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, client, pool, sent } from "$testing/pool";
import ComposerTags from "./ComposerTags.svelte";

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
      return json(200, {
        values: inUse.map((name) => ({ name, items: 1, unprocessed: 1 })),
      });
    }
    if (route === "GET /v1/templates") return json(200, { values: templates });
    if (route === "GET /v1/items/one/routing") return json(200, { values: [] });
    return json(200, {});
  });

  await client.tags.load();
  await client.templates.load();
  return transport;
}

function draw(
  names: readonly string[] = [],
  ontemplate: (template: unknown) => void = () => {},
  templates: readonly string[] = [],
) {
  render(ComposerTags, {
    props: { item: "one", names, templates, ontemplate },
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

test("a tag taken back is removed by pressing it, then its ×", async () => {
  await serving(["reading"]);
  draw(["reading"]);

  await fireEvent.click(word("reading"));
  await fireEvent.click(screen.getByRole("button", { name: "remove reading" }));

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

/** Routing by a tag beside the decision being made is a second way to make it. */
test("offers no trigger tag, in use or only declared", async () => {
  const LATER = { ...RESEARCH, id: "later", triggerTag: "route/later" };
  await serving(["route/research", "reading"], [RESEARCH, LATER]);
  draw();

  await opened();
  expect(screen.getByRole("option", { name: "reading" })).toBeDefined();
  expect(screen.queryByRole("option", { name: /route\/research/ })).toBeNull();
  expect(screen.queryByRole("option", { name: /route\/later/ })).toBeNull();
});

test("offers a tag under route/ that no template declares, which is ordinary", async () => {
  await serving(["route/nowhere"], [RESEARCH]);
  draw();

  await opened();
  expect(screen.getByRole("option", { name: "route/nowhere" })).toBeDefined();
});

test("takes the template of a trigger tag typed in, and tags nothing", async () => {
  await serving([], [RESEARCH]);
  const taken = vi.fn();
  draw([], taken);

  const line = await opened();
  await fireEvent.input(line, { target: { value: "route/research" } });
  expect(
    screen.getByRole("option", { name: /^\+ route\/research\s*→ research$/ }),
  ).toBeDefined();
  await fireEvent.keyDown(line, { key: "Enter" });

  expect(taken).toHaveBeenCalledWith(
    expect.objectContaining({ id: RESEARCH.id }),
  );

  // An ordinary tag after it, so a trigger tag sent first would be seen too.
  const again =
    screen.queryByRole("combobox", { name: "Add a tag" }) ?? (await opened());
  await fireEvent.input(again, { target: { value: "reading" } });
  await fireEvent.keyDown(again, { key: "Enter" });
  await vi.waitFor(async () => {
    expect(JSON.stringify(await sent())).toContain("reading");
  });
  expect(JSON.stringify(await sent())).not.toContain("route/research");
});

/** A trigger tag whose template's record still stands cannot be taken off here. */
test("draws a trigger tag whose template still stands as inert", async () => {
  await serving(["route/research"], [RESEARCH]);
  draw(["route/research"], () => {}, [RESEARCH.id]);

  const tag = screen.getByText("research");
  expect(tag.tagName).toBe("SPAN");
  expect(screen.queryByRole("button", { name: /route\/research/ })).toBeNull();
});
