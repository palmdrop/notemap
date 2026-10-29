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

/**
 * Typed into and left, the way the composer drives it: the field is
 * controlled, so the harness holds the value and re-renders on every change.
 */
async function settledFrom(
  typed: string,
  props: Record<string, unknown>,
  listed: string,
): Promise<string> {
  let held = "";
  const { rerender } = render(CandidateBrowser, {
    props: {
      destination: VAULT,
      capability: "append",
      field: "heading",
      label: "under",
      value: "",
      claims: false,
      onchange: (value: string) => {
        held = value;
        void rerender({ value } as never);
      },
      ...props,
    } as never,
  });
  const line = screen.getByRole("combobox", { name: "under" });
  await fireEvent.focus(line);
  await screen.findByText(listed);
  await fireEvent.input(line, { target: { value: typed } });
  await fireEvent.blur(line);
  return held;
}

/** A heading that is not there is written, so the head of one that is names a new one. */
test("settles a half-typed heading as typed", async () => {
  serving([
    { label: "## Next", value: "Next" },
    { label: "## Notes", value: "Notes" },
  ]);

  expect(
    await settledFrom("Ne", { given: { path: "half.md" } }, "## Next"),
  ).toBe("Ne");
});

test("settles a heading typed in another case to the one in the note", async () => {
  serving([{ label: "## Next", value: "Next" }]);

  expect(
    await settledFrom("next", { given: { path: "case.md" } }, "## Next"),
  ).toBe("Next");
});

test("settles the head of one title to its value where only what is there may be held", async () => {
  serving([
    { label: "Field Recordings", value: "field-recordings" },
    { label: "Reading", value: "reading" },
  ]);

  expect(
    await settledFrom("Fie", { offeredOnly: true }, "Field Recordings"),
  ).toBe("field-recordings");
});
