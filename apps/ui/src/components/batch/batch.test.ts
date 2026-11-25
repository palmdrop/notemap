import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { client, pool } from "$testing/pool";
import BatchRoute from "./BatchRoute.svelte";
import BatchTags from "./BatchTags.svelte";

const tagged = (id: string, ...names: string[]) =>
  anItem(id, {
    tags: names.map((name) => ({
      name,
      by: { kind: "person" as const },
      addedAt: "2026-11-01T10:00:00.000Z",
    })),
  });

test("the tag sheet draws a tag on only some of the rows dashed with how many, and a press puts it on all", async () => {
  pool(() => json(200, { values: [] }));
  const onbatch = vi.fn();
  render(BatchTags, {
    marked: [tagged("one", "home", "idea"), tagged("two", "home")],
    onbatch,
    onclose: vi.fn(),
  });

  // On both: a tag as a row draws it, with its ×.
  expect(screen.getByRole("button", { name: "remove home" })).toBeDefined();
  expect(screen.queryByRole("button", { name: /put home on/ })).toBeNull();

  const idea = screen.getByRole("button", {
    name: "put idea on every one, on 1/2 now",
  });
  await fireEvent.click(idea);
  expect(onbatch).toHaveBeenCalledWith({ kind: "tag", tag: "idea" });

  await fireEvent.click(screen.getByRole("button", { name: "remove home" }));
  expect(onbatch).toHaveBeenCalledWith({ kind: "untag", tag: "home" });
});

test("the tag sheet opens on its line, and a new tag typed goes on every row", async () => {
  pool(() => json(200, { values: [] }));
  const onbatch = vi.fn();
  render(BatchTags, {
    marked: [tagged("one"), tagged("two")],
    onbatch,
    onclose: vi.fn(),
  });

  const line = await screen.findByRole("combobox", {
    name: "Add a tag to every selected item",
  });
  await fireEvent.input(line, { target: { value: "errand" } });
  await fireEvent.keyDown(line, { key: "Enter" });

  expect(onbatch).toHaveBeenCalledWith({ kind: "tag", tag: "errand" });
});

test("a batch is routed only by a template with a trigger tag, as that tag", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/templates"
      ? json(200, {
          values: [
            {
              id: "t1",
              name: "To the vault",
              destination: "v",
              capability: "create",
              arguments: {},
              triggerTag: "route/vault",
            },
            {
              id: "t2",
              name: "By hand only",
              destination: "v",
              capability: "create",
              arguments: {},
            },
          ],
        })
      : json(200, { values: [] }),
  );
  await client.templates.load();
  const onbatch = vi.fn();
  render(BatchRoute, { count: 3, onbatch, onclose: vi.fn() });

  expect(screen.queryByText("By hand only")).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: /To the vault/ }));
  expect(onbatch).toHaveBeenCalledWith({ kind: "tag", tag: "route/vault" });
});

test("a tag taken off every row stays offered, to be put back, and once", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/tags"
      ? json(200, {
          values: [{ name: "home", items: 2, unprocessed: 2 }],
        })
      : json(200, { values: [] }),
  );
  await client.tags.load();
  const props = { onbatch: vi.fn(), onclose: vi.fn() };
  const { rerender } = render(BatchTags, {
    ...props,
    marked: [tagged("one", "home"), tagged("two", "home")],
  });
  expect(screen.queryByRole("option", { name: /home/ })).toBeNull();

  await rerender({ ...props, marked: [tagged("one"), tagged("two")] });
  expect(screen.getAllByRole("option", { name: /home/ })).toHaveLength(1);
});
