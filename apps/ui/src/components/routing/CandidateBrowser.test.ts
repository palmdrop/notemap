import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { pool } from "$testing/pool";
import CandidateBrowser from "./CandidateBrowser.svelte";

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";

function serving(entries: readonly Record<string, unknown>[]) {
  pool((request) =>
    routeOf(request).endsWith("/candidates")
      ? json(200, { kind: "answered", entries, truncated: false })
      : json(404, { error: { code: "unknown-route" } }),
  );
}

/** Each test asks of its own note, so no answer is recalled from another. */
async function opened(path: string): Promise<HTMLElement> {
  render(CandidateBrowser, {
    destination: VAULT,
    capability: "append",
    field: "heading",
    label: "under",
    value: "",
    given: { path },
    claims: false,
    onchange: () => {},
  });
  const line = screen.getByRole("combobox", { name: "under" });
  await fireEvent.focus(line);
  return screen.getByRole("listbox", { name: "under candidates" });
}

test("takes no room beneath the line where there is nothing to list", async () => {
  serving([]);

  const list = await opened("empty.md");

  await expect.poll(() => list.className).not.toContain("mt-2.5");
});

test("sets what it lists apart from the line", async () => {
  serving([{ label: "## Next", value: "Next" }]);

  const list = await opened("todo.md");

  await screen.findByText("## Next");
  expect(list.className).toContain("mt-2.5");
});
