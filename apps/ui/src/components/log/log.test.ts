import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import type { Action } from "@notemap/client";
import { anItem, json, refusal, routeOf } from "@notemap/client/testing";

import { asked, client, pool, sentUrls } from "$testing/pool";
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

const SUBJECT = "0198f0c2-9d3a-7b21-8e4f-112233445e6f";

/** What the shell holds of the capture, which is what a subject is drawn from. */
function saying(words: string) {
  return (request: Request) =>
    routeOf(request) === `GET /v1/items/${SUBJECT}`
      ? json(
          200,
          anItem(SUBJECT, {
            payload: {
              type: "text",
              content: { text: words },
              metadata: {},
              assets: [],
            },
          }),
        )
      : held([anAction("one")])(request);
}

/** An id is what the pool says; the capture is what a person came to find. */
test("links a subject to the capture it is about", async () => {
  pool(held([anAction("one")]));
  render(Log);
  reading();

  const link = await screen.findByRole("link", { name: "0198f0c2…5e6f" });
  expect(link).toHaveProperty("pathname", `/items/${SUBJECT}`);
});

/**
 * An entry naming an id is one nobody can connect to anything they wrote. The
 * capture's own first words go in its place wherever the shell already holds
 * them — which is the whole of what this change was for.
 */
test("says the capture's own first words where the shell holds them", async () => {
  pool(saying("the picker needs a trail"));
  await client.item(SUBJECT);

  render(Log);
  reading();

  const link = await screen.findByRole("link", {
    name: "the picker needs a trail",
  });
  expect(link).toHaveProperty("pathname", `/items/${SUBJECT}`);
});

/** Nothing is read for it: a hundred rows are a hundred lookups and no requests. */
test("asks the pool for nothing to say what an entry is about", async () => {
  pool(held([anAction("one")]));
  render(Log);
  reading();
  await screen.findByText("captured");

  expect(asked()).not.toContain(`GET /v1/items/${SUBJECT}`);
});

/** The same words where a person has committed to one item, not the id again. */
test("says what the narrowed log is narrowed to in the capture's own words", async () => {
  pool(saying("the picker needs a trail"));
  await client.item(SUBJECT);

  render(Log);
  reading(SUBJECT);

  expect(
    (await screen.findByText(LOG_LEDE, { exact: false })).textContent,
  ).toContain("the picker needs a trail");
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

test("narrows to a view's kinds, asking the pool rather than sifting the page", async () => {
  pool(held([anAction("one", { kind: "routed" })]));
  render(Log);
  log.reading("newest-first", undefined, ["routed", "template-fired"]);
  await screen.findByText("routed");

  const read = asked().find((route) => route === "GET /v1/actions");
  expect(read).toBeDefined();
  expect(sentUrls().at(-1)).toContain("kind=routed%2Ctemplate-fired");

  log.arrived(arriving(anAction("two", { kind: "tagged" })));
  expect(log.rows.map((action) => action.id)).toEqual(["one"]);
});

test("offers the views as links and says which one is being read", async () => {
  pool(held([anAction("one", { kind: "routed" })]));
  render(Log);
  log.reading("newest-first", undefined, [
    "routed",
    "template-fired",
    "delivery-failed",
    "delivery-cancelled",
  ]);
  await screen.findByText("routed");

  const narrow = screen.getByRole("navigation", { name: "Narrow the log to" });
  expect(narrow.textContent).toContain("routing");
  expect(screen.queryByRole("link", { name: "routing" })).toBeNull();
  expect(screen.getByRole("link", { name: "everything" })).toHaveProperty(
    "search",
    "?order=newest-first",
  );
  expect(
    screen.getByRole("link", { name: "captures" }).getAttribute("href"),
  ).toContain("kind=captured");
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

/**
 * The wiring the rest of these reach past: the shell's own watcher is what
 * puts news at the head, and `more` is what says the reading is stale.
 */
test("takes what the watcher reads at its head", async () => {
  vi.useFakeTimers();
  let logged = [anAction("one", { kind: "captured" })];
  pool((request) =>
    routeOf(request) === "GET /v1/actions"
      ? json(200, { values: logged })
      : json(200, { values: [] }),
  );

  render(Log);
  reading();
  await vi.advanceTimersByTimeAsync(100);
  expect(log.rows.map((action) => action.id)).toEqual(["one"]);

  logged = [anAction("two", { kind: "routed" }), ...logged];
  await vi.advanceTimersByTimeAsync(10_000);

  expect(log.rows.map((action) => action.id)).toEqual(["two", "one"]);
  vi.useRealTimers();
});

/**
 * More happened than one read answers, so what arrived is not what is missing.
 * The page is read again rather than grown from a head that is not the head.
 */
test("reads again from the top where more happened than a page holds", async () => {
  vi.useFakeTimers();
  let logged = [anAction("one")];
  // A page that always says there is another, so the only thing that changes
  // between the two reads is whether the mark is still on it.
  pool((request) =>
    routeOf(request) === "GET /v1/actions"
      ? json(200, { values: logged, next: `/v1/actions?after=${AT}%2Cx` })
      : json(200, { values: [] }),
  );

  render(Log);
  reading();
  await vi.advanceTimersByTimeAsync(100);

  // The mark's own entry gone from the page: the watcher reads that as more
  // happening than it can hand over.
  logged = [anAction("three"), anAction("two")];
  await vi.advanceTimersByTimeAsync(10_000);

  await vi.waitFor(() => {
    expect(log.rows.map((action) => action.id)).toEqual(["three", "two"]);
  });
  vi.useRealTimers();
});

/**
 * Oldest-first the walk starts at the oldest entry and grows towards the news,
 * so nothing it holds went stale — and ten walked pages are not somebody's to
 * throw away for a burst at the far end.
 */
test("keeps an oldest-first walk where more happened than a page holds", async () => {
  pool(held([anAction("one")]));
  render(Log);
  log.reading("oldest-first", undefined);
  await screen.findByText("captured");

  log.raced();

  expect(log.rows.map((action) => action.id)).toEqual(["one"]);
});
