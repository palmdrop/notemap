import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import type { Action } from "@notemap/client";
import { json, refusal, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import { log } from "$lib/log.svelte";
import { LOG_LEDE, NOTHING_LOGGED } from "$lib/said";
import Log from "./Log.svelte";
import LogRow from "./LogRow.svelte";
import Shown from "./Shown.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

// Module-scoped, as the rail is: the log a test walked is not the next one's.
afterEach(() => {
  log.forget();
});

type Row = Record<string, unknown>;

const AT = "2026-09-02T11%3A14%3A00.000Z";

function anAction(id: string, overrides: Row = {}): Row {
  return {
    id,
    kind: "captured",
    subject: "0198f0c2-9d3a-7b21-8e4f-112233445e6f",
    by: { kind: "person" },
    at: "2026-09-02T11:14:00.000Z",
    detail: {},
    ...overrides,
  };
}

function held(values: Row[], next?: string) {
  return (request: Request) =>
    routeOf(request) === "GET /v1/actions"
      ? json(200, { values, ...(next === undefined ? {} : { next }) })
      : json(200, { values: [] });
}

/** The watcher hands the log actions, where a stub hands it rows. */
function arriving(...rows: Row[]): Action[] {
  return rows as unknown as Action[];
}

/** The route is what reads; a test standing in for it says what to read. */
function reading(item?: string) {
  log.reading("newest-first", item);
}

test("draws what the pool has done, with the kind as the row's own word", async () => {
  pool(held([anAction("one", { kind: "routed" })]));
  render(Log);
  reading();

  expect(await screen.findByText("routed")).toBeDefined();
  expect(screen.getByText(LOG_LEDE, { exact: false })).toBeDefined();
});

test("says nothing has happened when nothing has", async () => {
  pool(held([]));
  render(Log);
  reading();

  expect(await screen.findByText(NOTHING_LOGGED)).toBeDefined();
  expect(screen.getByText("quiet")).toBeDefined();
});

test("flattens a detail into pairs rather than stringifying it", async () => {
  pool(
    held([
      anAction("one", {
        kind: "routed",
        detail: {
          capability: "create-or-append",
          arguments: { path: "projects/notemap/notes/decisions.md" },
        },
      }),
    ]),
  );
  render(Log);
  reading();

  expect(await screen.findByText("arguments.path")).toBeDefined();
  expect(screen.getByText("projects/notemap/notes/decisions.md")).toBeDefined();
});

/** An id is what the pool says; the capture is what a person came to find. */
test("links a subject to the capture it is about", async () => {
  pool(held([anAction("one")]));
  render(Log);
  reading();

  const link = await screen.findByRole("link", { name: "0198f0c2…5e6f" });
  expect(link).toHaveProperty(
    "pathname",
    "/items/0198f0c2-9d3a-7b21-8e4f-112233445e6f",
  );
});

test("keeps the log narrowed to that subject a word away", async () => {
  pool(held([anAction("one")]));
  render(Log);
  reading();

  const link = await screen.findByRole("link", { name: "only this" });
  // The order travels with it, so following one does not turn the log around.
  expect(link).toHaveProperty(
    "search",
    "?item=0198f0c2-9d3a-7b21-8e4f-112233445e6f&order=newest-first",
  );
});

test("says what it is narrowed to, and offers the way back", async () => {
  pool(held([anAction("one")]));
  render(Log);
  reading("0198f0c2-9d3a-7b21-8e4f-112233445e6f");

  expect(
    await screen.findByRole("link", { name: "show everything" }),
  ).toBeDefined();

  await vi.waitFor(() => {
    expect(asked()).toContain("GET /v1/actions");
  });
});

test("walks on from the position the last page handed back", async () => {
  // Keyed on the position rather than counted: the watcher reads the head on
  // its own, and a stub that counted would hand it somebody else's page.
  pool((request) => {
    if (routeOf(request) !== "GET /v1/actions")
      return json(200, { values: [] });

    const from = new URL(request.url).searchParams.get("after");
    return json(
      200,
      from === null
        ? { values: [anAction("one")], next: `/v1/actions?after=${AT}%2Cone` }
        : { values: [anAction("two")] },
    );
  });
  render(Log);
  reading();

  await fireEvent.click(
    await screen.findByRole("button", { name: "load more" }),
  );

  await vi.waitFor(() => {
    expect(log.rows.map((action) => action.id)).toEqual(["one", "two"]);
  });
});

/**
 * A keyed block throws on a duplicate, which would take the whole surface down
 * — the worst thing a log can do to somebody working out what went wrong.
 */
test("keeps one row for an id a second page hands back again", async () => {
  pool(held([anAction("one")], `/v1/actions?after=${AT}%2Cone`));
  render(Log);
  reading();

  await fireEvent.click(
    await screen.findByRole("button", { name: "load more" }),
  );

  await vi.waitFor(() => {
    expect(log.rows.map((action) => action.id)).toEqual(["one"]);
  });
});

test("turning the log around walks it again rather than stitching two orders", async () => {
  const transport = pool(
    held([anAction("one")], `/v1/actions?after=${AT}%2Cone`),
  );
  render(Log);
  reading();

  await vi.waitFor(() => {
    expect(log.shown).toBe(1);
  });

  log.reading("oldest-first", undefined);

  await vi.waitFor(() => {
    expect(log.order).toBe("oldest-first");
    expect(log.shown).toBe(1);
  });

  // A position belongs to the order that made it, so the turn carries none.
  const turned = new URL(transport.sent.at(-1)!.url).searchParams;
  expect(turned.get("order")).toBe("oldest-first");
  expect(turned.has("after")).toBe(false);
});

test("spends the accent on a failure and on the code beside it, and on nothing else", () => {
  render(LogRow, {
    order: "newest-first",
    action: {
      id: "one",
      kind: "delivery-failed",
      subject: "0198f0c2-9d3a-7b21-8e4f-112233445e6f",
      by: { kind: "notemap" },
      at: "2026-09-02T11:16:00.000Z",
      detail: {
        failure: { code: "unreachable", detail: "/vaults/obsidian: ENOENT" },
      },
    },
  });

  expect(screen.getByText("delivery-failed").className).toContain(
    "inverted-accent",
  );
  expect(screen.getByText("unreachable").className).toContain("text-accent");
  expect(screen.getByText("/vaults/obsidian: ENOENT").className).not.toContain(
    "text-accent",
  );
});

test("leaves a destruction as a fact rather than a warning", () => {
  render(LogRow, {
    order: "newest-first",
    action: {
      id: "one",
      kind: "purged",
      by: { kind: "notemap" },
      at: "2026-09-02T11:30:00.000Z",
      detail: { items: 3 },
    },
  });

  const word = screen.getByText("purged");
  expect(word.className).toContain("inverted");
  expect(word.className).not.toContain("inverted-accent");
});

test("says a refusal where the count goes, and says neither before a read", () => {
  render(Shown);
  expect(screen.queryByRole("status")).toBeNull();
});

test("counts what is shown once rows arrive", async () => {
  pool(held([anAction("one"), anAction("two")]));
  render(Shown);
  reading();

  expect(await screen.findByText("2 shown")).toBeDefined();
});

/** The read behind the page is what refuses; the page itself stays served. */
test("puts a refusal in the chrome, in accent, instead of the count", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/actions"
      ? refusal(422, "bad-position")
      : json(200, { values: [] }),
  );
  render(Shown);
  reading();

  const said = await screen.findByRole("status");
  expect(said.className).toContain("text-accent");
  expect(said.textContent).toBe("the app lost its place in the list; reload");
  expect(screen.queryByText(/shown/)).toBeNull();
});

/**
 * The watcher is already asking on the shell's own tempo. A log that did not
 * listen to it was the one surface where reading meant reloading.
 */
test("puts what has happened since at the head of what is drawn", async () => {
  pool(held([anAction("one", { kind: "captured" })]));
  render(Log);
  reading();
  await screen.findByText("captured");

  log.arrived(arriving(anAction("two", { kind: "routed" })));

  await vi.waitFor(() => {
    expect(screen.getByText("routed")).toBeDefined();
  });
  expect(log.rows.map((action) => action.id)).toEqual(["two", "one"]);
});

test("takes what it is already holding only once", async () => {
  pool(held([anAction("one")]));
  render(Log);
  reading();
  await screen.findByText("captured");

  log.arrived(arriving(anAction("one")));

  expect(log.rows.map((action) => action.id)).toEqual(["one"]);
});

/** Narrowed to one item, an entry about another is not what is being read. */
test("leaves out what is not about the item it is narrowed to", async () => {
  pool(held([anAction("one")]));
  render(Log);
  reading("0198f0c2-9d3a-7b21-8e4f-112233445e6f");
  await screen.findByText("captured");

  log.arrived(arriving(anAction("two", { subject: "another" })));

  expect(log.rows.map((action) => action.id)).toEqual(["one"]);
});

/**
 * Read oldest-first the page starts at the oldest entry, and what just
 * happened belongs past the end of a walk nobody has finished — under page one
 * it would sit beside entries from months before it.
 */
test("waits for the walk where the log is read oldest-first", async () => {
  pool(held([anAction("one")]));
  render(Log);
  log.reading("oldest-first", undefined);
  await screen.findByText("captured");

  log.arrived(arriving(anAction("two")));

  expect(log.rows.map((action) => action.id)).toEqual(["one"]);
});
