import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import PathLine from "./PathLine.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const VAULT = "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77";

type Entry = { label: string; value?: string; scope?: string };

const answered = (entries: readonly Entry[], truncated = false) => ({
  kind: "answered",
  entries,
  truncated,
});

const folder = (label: string, scope: string): Entry => ({ label, scope });
const file = (label: string, value: string): Entry => ({ label, value });

/** A vault answering per scope, the way `filesystemCandidates` does. */
function serving(
  answerAt: (scope: string | undefined) => Record<string, unknown>,
) {
  return pool((request) => {
    if (routeOf(request).endsWith("/candidates")) {
      const scope = new URL(request.url).searchParams.get("scope") ?? undefined;
      return json(200, answerAt(scope));
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

const TREE: Record<string, readonly Entry[]> = {
  "": [folder("journal", "journal"), folder("projects", "projects")],
  projects: [
    folder("kontradiktion", "projects/kontradiktion"),
    folder("notemap", "projects/notemap"),
  ],
  "projects/notemap": [
    folder("notes", "projects/notemap/notes"),
    file("readme.md", "projects/notemap/readme.md"),
  ],
};

const servingTree = () =>
  serving((scope) => {
    const entries = TREE[scope ?? ""];
    return entries === undefined
      ? { kind: "unreachable", detail: `${String(scope)}: ENOENT` }
      : answered(entries);
  });

/**
 * The line is controlled, so the harness holds the value the way the composer
 * does and re-renders on every change.
 */
function draw(value = "", said: unknown = undefined) {
  const submitted = vi.fn();
  const { rerender } = render(PathLine, {
    props: {
      destination: VAULT,
      capability: "create-or-append-file",
      field: "path",
      label: "where",
      value,
      said,
      onchange: (next: string) => {
        held = next;
        void rerender({ value: next } as never);
      },
      onsubmit: submitted,
    } as never,
  });

  let held = value;
  return {
    submitted,
    line: () => screen.getByRole("combobox") as HTMLInputElement,
    value: () => held,
    type: async (next: string) => {
      held = next;
      await rerender({ value: next } as never);
    },
  };
}

const settled = () =>
  vi.waitFor(() => expect(asked().length).toBeGreaterThan(0));

test("draws the levels along the path, each with its siblings", async () => {
  servingTree();
  const line = draw("projects/notemap/");

  await screen.findByText("notes/");

  const places = screen.getByRole("listbox", { name: "places" });
  const drawn = [...places.querySelectorAll('[role="option"]')].map((each) =>
    each.textContent?.trim(),
  );

  expect(drawn).toEqual([
    "journal/",
    "projects/",
    "kontradiktion/",
    "notemap/",
    "notes/",
    "readme.md",
  ]);
  expect(line.value()).toBe("projects/notemap/");
});

test("asks once per level along the path", async () => {
  servingTree();
  draw("projects/notemap/");

  await screen.findByText("notes/");

  const scopes = asked().filter((route) => route.includes("/candidates"));
  expect(scopes).toHaveLength(3);
});

test("narrows the deepest level to what is typed, and leaves the rest whole", async () => {
  servingTree();
  draw("projects/notemap/no");

  await screen.findByText("notes/");

  expect(screen.queryByText("readme.md")).toBeNull();
  expect(screen.getByText("kontradiktion/")).toBeDefined();
});

test("completes the segment under the caret with Tab", async () => {
  servingTree();
  const line = draw("pro");

  await screen.findByText("projects/");
  await fireEvent.keyDown(line.line(), { key: "Tab" });

  expect(line.value()).toBe("projects/");
});

test("completes only as far as several matches agree", async () => {
  serving(() =>
    answered([folder("projects", "projects"), folder("promises", "promises")]),
  );
  const line = draw("p");

  await screen.findByText("projects/");
  await fireEvent.keyDown(line.line(), { key: "Tab" });

  expect(line.value()).toBe("pro");
});

test("descends when a folder is taken, keeping what came before it", async () => {
  servingTree();
  const line = draw("projects/");

  await screen.findByText("notemap/");
  await fireEvent.mouseDown(screen.getByText("notemap/"));

  expect(line.value()).toBe("projects/notemap/");
});

test("pops the whole segment when backspace lands at its head", async () => {
  servingTree();
  const line = draw("projects/notemap/");

  await screen.findByText("notes/");
  line.line().setSelectionRange(17, 17);
  await fireEvent.keyDown(line.line(), { key: "Backspace" });

  expect(line.value()).toBe("projects/");
});

test("leaves an ordinary backspace to the input", async () => {
  servingTree();
  const line = draw("projects/note");

  await screen.findByText("notemap/");
  line.line().setSelectionRange(13, 13);
  await fireEvent.keyDown(line.line(), { key: "Backspace" });

  expect(line.value()).toBe("projects/note");
});

test("moves through the deepest level with the arrows and takes with enter", async () => {
  servingTree();
  const line = draw("projects/notemap/");

  await screen.findByText("notes/");
  await fireEvent.keyDown(line.line(), { key: "ArrowDown" });
  await fireEvent.keyDown(line.line(), { key: "Enter" });

  expect(line.value()).toBe("projects/notemap/readme.md");
  expect(line.submitted).not.toHaveBeenCalled();
});

test("enter with nothing picked commits, which is the ordinary way through", async () => {
  servingTree();
  const line = draw("projects/notemap/");

  await screen.findByText("notes/");
  await fireEvent.keyDown(line.line(), { key: "Enter" });

  expect(line.submitted).toHaveBeenCalled();
});

test("says an answer was cut short rather than pretending it was whole", async () => {
  serving(() => answered([folder("a", "a")], true));
  draw();

  expect(await screen.findByText("more than this shows")).toBeDefined();
});

/** The trail survives: a folder being typed does not exist, and that is not a refusal. */
test("keeps the levels that answered when a deeper scope is not there yet", async () => {
  servingTree();
  draw("projects/nope/");

  await screen.findByText("kontradiktion/");

  expect(screen.getByText("journal/")).toBeDefined();
  expect(screen.queryByText(/ENOENT/)).toBeNull();
});

test("says why when the destination itself cannot be asked", async () => {
  serving(() => ({ kind: "unreachable", detail: "the vault is not mounted" }));
  draw();

  await settled();
  expect(
    await screen.findByText(/unreachable · the vault is not mounted/),
  ).toBeDefined();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("says so plainly where the kind offers nothing to browse", async () => {
  serving(() => ({ kind: "not-offered" }));
  draw();

  expect(await screen.findByText("not offered")).toBeDefined();
});

test("still holds a typed path nothing ever listed", async () => {
  serving(() => answered([]));
  const line = draw();

  await settled();
  await line.type("brand-new/folder.md");

  expect(line.value()).toBe("brand-new/folder.md");
});

const SAID = { content: { text: "Picker needs a trail" }, item: "item-1" };

const servingFolder = (entries: readonly Entry[]) =>
  serving((scope) =>
    scope === undefined ? answered(entries) : { kind: "not-offered" },
  );

test("says create in one word for a name the folder does not hold", async () => {
  servingFolder([file("decisions.md", "decisions.md")]);
  draw("picker.md", SAID);

  expect(await screen.findByText("create")).toBeDefined();
});

test("says append for a name it does", async () => {
  servingFolder([file("decisions.md", "decisions.md")]);
  draw("decisions.md", SAID);

  expect(await screen.findByText("append")).toBeDefined();
});

test("names the folders it will make, in the accent", async () => {
  servingFolder([]);
  draw("drafts/deep/picker.md", SAID);

  expect(await screen.findByText("+ drafts/")).toBeDefined();
  expect(screen.getByText("+ deep/")).toBeDefined();
});

test("shows the name a blank leaf would get rather than a gap", async () => {
  servingFolder([]);
  draw("", SAID);

  expect(
    await screen.findByText("derived · Picker needs a trail.md"),
  ).toBeDefined();
});

test("offers a free name beside one that is taken, and shift-enter takes it", async () => {
  servingFolder([file("decisions.md", "decisions.md")]);
  const line = draw("decisions.md", SAID);

  await screen.findByText("append");
  expect(screen.getByRole("button", { name: /decisions-1\.md/ })).toBeDefined();

  await fireEvent.keyDown(line.line(), { key: "Enter", shiftKey: true });
  expect(line.submitted).toHaveBeenCalledWith("decisions-1.md");
});

/** Nothing is being overridden, so there is nothing for the key to mean. */
test("shift-enter does nothing where the name is free", async () => {
  servingFolder([]);
  const line = draw("picker.md", SAID);

  await screen.findByText("create");
  await fireEvent.keyDown(line.line(), { key: "Enter", shiftKey: true });

  expect(line.submitted).not.toHaveBeenCalled();
});

test("draws no word at all where the destination could not be asked", async () => {
  serving(() => ({ kind: "unreachable", detail: "the vault is not mounted" }));
  draw("picker.md", SAID);

  await screen.findByText(/not mounted/);
  expect(screen.queryByText("create")).toBeNull();
  expect(screen.queryByText("append")).toBeNull();
});
