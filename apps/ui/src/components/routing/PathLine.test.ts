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

/**
 * Places routed to before are the composer's to read, and it hands them down.
 * Held here so a test naming them still reads as one arrangement.
 */
let offered: readonly Record<string, unknown>[] = [];

/** A vault answering per scope, the way `filesystemCandidates` does. */
function serving(
  answerAt: (scope: string | undefined) => Record<string, unknown>,
  places: readonly Record<string, unknown>[] = [],
) {
  offered = places;
  return pool((request) => {
    const route = routeOf(request);
    if (route.endsWith("/candidates")) {
      const scope = new URL(request.url).searchParams.get("scope") ?? undefined;
      return json(200, answerAt(scope));
    }
    if (route.endsWith("/remembered")) {
      return json(200, { truncated: false, places });
    }
    return json(404, { error: { code: "unknown-route" } });
  });
}

const used = (
  value: string,
  uses: number,
  lastAt = "2026-09-01T10:00:00.000Z",
) => ({
  value,
  uses,
  lastAt,
});

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
      capability: "create-or-append",
      field: "path",
      label: "where",
      value,
      said,
      places: offered,
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

/**
 * The tree shows every level at once, so pointing at one is going there — not
 * adding its name to the end of what is typed, which made folders nobody meant.
 */
test("drills down to a folder taken from a level above the caret", async () => {
  servingTree();
  const line = draw("projects/notemap/");

  await screen.findByText("notes/");
  await fireEvent.mouseDown(screen.getByText("journal/"));

  expect(line.value()).toBe("journal/");
});

test("drills down to a folder taken from a level between", async () => {
  servingTree();
  const line = draw("projects/notemap/");

  await screen.findByText("notes/");
  await fireEvent.mouseDown(screen.getByText("kontradiktion/"));

  expect(line.value()).toBe("projects/kontradiktion/");
});

test("takes a note as the whole line, so what happens next is an append", async () => {
  servingTree();
  const line = draw("projects/notemap/");

  const note = await screen.findByText("readme.md");
  await fireEvent.mouseDown(note);

  expect(line.value()).toBe("projects/notemap/readme.md");
});

test("takes a folder under the caret without repeating the path", async () => {
  servingTree();
  const line = draw("projects/notemap/");

  await fireEvent.mouseDown(await screen.findByText("notes/"));

  expect(line.value()).toBe("projects/notemap/notes/");
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

/**
 * The line is what the composer is for, and leaving it is a gesture worth
 * making deliberately: `⇧⇥`, or the pointer.
 */
test("tab with nothing to complete does nothing rather than handing focus away", async () => {
  servingTree();
  const line = draw("zz");

  await settled();

  const went = fireEvent.keyDown(line.line(), { key: "Tab" });
  // `fireEvent` answers false where the default was prevented.
  expect(await went).toBe(false);
  expect(line.value()).toBe("zz");
});

/**
 * A tree that gains and loses a whole level as a segment is typed moves
 * everything under it, and the control being typed into must not move.
 */
test("keeps a floor under the tree, so a shallow answer leaves room", async () => {
  servingTree();
  draw("");

  await settled();
  const tree = screen.getByRole("listbox", { name: "places" });
  expect(tree.className).toContain("--spacing-tree");
});

test("keeps no floor where there is no tree to hold up", async () => {
  serving(() => ({ kind: "unreachable", detail: "not mounted" }));
  draw("");

  await screen.findByText("unreachable · best effort");
  expect(
    screen.getByRole("listbox", { name: "places" }).className,
  ).not.toContain("--spacing-tree");
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

/**
 * Down the tree as it is drawn, not one level of it: the pointer takes any row,
 * so the arrows reach any row, or they are two different trees.
 */
test("moves down the drawn tree with the arrows and takes with enter", async () => {
  servingTree();
  const line = draw("projects/notemap/");

  await screen.findByText("notes/");
  for (let press = 0; press < 5; press += 1) {
    await fireEvent.keyDown(line.line(), { key: "ArrowDown" });
  }
  await fireEvent.keyDown(line.line(), { key: "Enter" });

  expect(line.value()).toBe("projects/notemap/notes/");
  expect(line.submitted).not.toHaveBeenCalled();
});

/** The first press lands on the first row rather than skipping it. */
test("the first arrow reaches the first row of the tree", async () => {
  servingTree();
  const line = draw("projects/notemap/");

  await screen.findByText("notes/");
  await fireEvent.keyDown(line.line(), { key: "ArrowDown" });
  await fireEvent.keyDown(line.line(), { key: "Enter" });

  expect(line.value()).toBe("journal/");
});

/** Which is the whole point of reaching them: a folder two levels up is takeable. */
test("takes an ancestor's sibling the arrows reached", async () => {
  servingTree();
  const line = draw("projects/notemap/");

  await screen.findByText("notes/");
  await fireEvent.keyDown(line.line(), { key: "ArrowUp" });
  await fireEvent.keyDown(line.line(), { key: "Enter" });

  expect(line.value()).toBe("projects/notemap/readme.md");
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

test("says a destination that cannot be asked is best effort, not a refusal", async () => {
  serving(() => ({ kind: "unreachable", detail: "the vault is not mounted" }));
  draw();

  await settled();
  const said = await screen.findByText("unreachable · best effort");
  expect(said).toBeDefined();
  // The detail is kept where a hover reaches it rather than spent on a line.
  expect(said.getAttribute("title")).toBe("the vault is not mounted");
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

/** In the tree, where they will be, rather than named off beside the word. */
test("draws the folders it will make under the deepest one that is there", async () => {
  servingFolder([]);
  draw("drafts/deep/picker.md", SAID);

  expect(await screen.findByText("+ drafts/")).toBeDefined();
  expect(screen.getByText("+ deep/")).toBeDefined();
  expect(screen.getByText("+ picker.md")).toBeDefined();

  const made = screen.getByText("+ drafts/");
  expect(made.getAttribute("aria-disabled")).toBe("true");
});

test("draws the note itself under the folder that already holds it", async () => {
  servingFolder([folder("drafts", "drafts")]);
  draw("picker.md", SAID);

  expect(await screen.findByText("+ picker.md")).toBeDefined();
});

/** In the tree, where the note lands, rather than beside the word it is not. */
test("shows the name a blank leaf would get rather than a gap", async () => {
  servingFolder([]);
  draw("", SAID);

  expect(await screen.findByText("+ Picker needs a trail.md")).toBeDefined();
});

/**
 * Drawn after the whole tree, the tail sat under whatever root folder was drawn
 * last — which said the note was going somewhere nobody typed.
 */
test("draws what it will make inside the folder that will hold it", async () => {
  serving((scope) =>
    scope === undefined
      ? answered([folder("projects", "projects"), folder("reading", "reading")])
      : scope === "projects"
        ? answered([])
        : { kind: "unreachable", detail: `${scope}: ENOENT` },
  );
  draw("projects/drafts/picker.md", SAID);

  await screen.findByText("+ drafts/");
  const drawn = [...screen.getByRole("listbox").children].map(
    (row) => row.textContent,
  );

  expect(drawn).toEqual(["projects/", "+ drafts/", "+ picker.md", "reading/"]);
});

test("offers a free name beside one that is taken, and shift-enter takes it", async () => {
  servingFolder([file("decisions.md", "decisions.md")]);
  const line = draw("decisions.md", SAID);

  await screen.findByText("append");
  expect(screen.getByRole("button", { name: /decisions-1\.md/ })).toBeDefined();

  await fireEvent.keyDown(line.line(), { key: "Enter", shiftKey: true });
  expect(line.submitted).toHaveBeenCalledWith("decisions-1.md");
});

/**
 * Nothing is taken, so there is nothing to make a new one beside — and making
 * one is what routing already does. Swallowing the key would leave a keystroke
 * that does nothing at all.
 */
test("shift-enter routes where the name is free", async () => {
  servingFolder([]);
  const line = draw("picker.md", SAID);

  await screen.findByText("create");
  await fireEvent.keyDown(line.line(), { key: "Enter", shiftKey: true });

  expect(line.submitted).toHaveBeenCalledWith(undefined);
});

test("draws no word at all where the destination could not be asked", async () => {
  serving(() => ({ kind: "unreachable", detail: "the vault is not mounted" }));
  draw("picker.md", SAID);

  await screen.findByText("unreachable · best effort");
  expect(screen.queryByText("create")).toBeNull();
  expect(screen.queryByText("append")).toBeNull();
});

test("offers the best remembered place as a greyed continuation", async () => {
  serving(
    () => answered([folder("projects", "projects")]),
    [used("projects/notemap/notes/", 41)],
  );
  draw("pro");

  await vi.waitFor(() => {
    expect(screen.getByText("jects/notemap/notes/")).toBeDefined();
  });
});

/** Two keys, never one: `⇥` completes a segment and `→` takes the whole thing. */
test("the right arrow takes the whole continuation and tab does not", async () => {
  serving(
    () => answered([folder("projects", "projects")]),
    [used("projects/notemap/notes/", 41)],
  );
  const line = draw("pro");

  await screen.findByText("projects/");
  await vi.waitFor(() => {
    expect(screen.getByText("jects/notemap/notes/")).toBeDefined();
  });

  line.line().setSelectionRange(3, 3);
  await fireEvent.keyDown(line.line(), { key: "Tab" });
  expect(line.value()).toBe("projects/");
});

test("the right arrow takes it whole", async () => {
  serving(
    () => answered([folder("projects", "projects")]),
    [used("projects/notemap/notes/", 41)],
  );
  const line = draw("pro");

  await vi.waitFor(() => {
    expect(screen.getByText("jects/notemap/notes/")).toBeDefined();
  });

  line.line().setSelectionRange(3, 3);
  await fireEvent.keyDown(line.line(), { key: "ArrowRight" });

  expect(line.value()).toBe("projects/notemap/notes/");
});

/**
 * `gone` is drawn nowhere any more, the flag being kept for exactly one thing:
 * a discrepancy has to be looked at, so it is never the thing taken without
 * reading.
 */
test("a gone place is never the greyed continuation", async () => {
  serving(
    () =>
      answered([folder("dossiers", "dossiers"), folder("journal", "journal")]),
    [used("drafts/", 12)],
  );
  const line = draw("d");

  await screen.findByText("dossiers/");
  expect(document.querySelector("[data-ghost]")).toBeNull();

  line.line().setSelectionRange(1, 1);
  await fireEvent.keyDown(line.line(), { key: "ArrowRight" });
  expect(line.value()).toBe("d");
});

test("but the arrows reach it deliberately", async () => {
  serving(
    () =>
      answered([folder("dossiers", "dossiers"), folder("journal", "journal")]),
    [used("drafts/", 12)],
  );
  const line = draw("d");

  await screen.findByText("dossiers/");

  await fireEvent.keyDown(line.line(), { key: "ArrowDown" });
  await fireEvent.keyDown(line.line(), { key: "Enter" });

  expect(line.value()).toBe("drafts/");
});

/** The pool holds these and the pool is reachable whenever the composer is open. */
test("still completes remembered places against an unreachable destination", async () => {
  serving(
    () => ({ kind: "unreachable", detail: "the vault is not mounted" }),
    [used("projects/notemap/notes/", 41)],
  );
  const line = draw("pro");

  await vi.waitFor(() => {
    expect(screen.getByText("jects/notemap/notes/")).toBeDefined();
  });

  await fireEvent.keyDown(line.line(), { key: "ArrowRight" });
  expect(line.value()).toBe("projects/notemap/notes/");
});

/** The record is still made and the delivery deferred, which is what best effort means. */
test("an unreachable destination leaves the line typed and the tree empty", async () => {
  serving(() => ({ kind: "unreachable", detail: "the vault is not mounted" }));
  const line = draw("projects/notemap/decisions.md", SAID);

  await screen.findByText("unreachable · best effort");

  expect(line.line().value).toBe("projects/notemap/decisions.md");
  expect(
    screen
      .getByRole("listbox", { name: "places" })
      .querySelectorAll('[role="option"]'),
  ).toHaveLength(0);
});

test("a kind that offers nothing draws the same plain typed path", async () => {
  serving(() => ({ kind: "not-offered" }));
  const line = draw("drafts/picker.md", SAID);

  await screen.findByText("not offered");

  expect(line.line().value).toBe("drafts/picker.md");
  expect(screen.queryByText("create")).toBeNull();
  expect(
    screen
      .getByRole("listbox", { name: "places" })
      .querySelectorAll('[role="option"]'),
  ).toHaveLength(0);
});
