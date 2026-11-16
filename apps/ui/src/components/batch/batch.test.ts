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

test("the tag sheet says each tag is on all, some or none of the selected rows, and a press puts it on all or takes it off all", async () => {
  pool(() => json(200, { values: [] }));
  const onbatch = vi.fn();
  render(BatchTags, {
    marked: [tagged("one", "home", "idea"), tagged("two", "home")],
    onbatch,
    onclose: vi.fn(),
  });

  const home = screen.getByRole("checkbox", { name: /home/ });
  const idea = screen.getByRole("checkbox", { name: /idea/ });
  expect(home.getAttribute("aria-checked")).toBe("true");
  expect(idea.getAttribute("aria-checked")).toBe("mixed");

  await fireEvent.click(home);
  expect(onbatch).toHaveBeenLastCalledWith({ kind: "untag", tag: "home" });
  await fireEvent.click(idea);
  expect(onbatch).toHaveBeenLastCalledWith({ kind: "tag", tag: "idea" });
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
