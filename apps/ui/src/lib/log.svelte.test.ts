import { afterEach, expect, test, vi } from "vitest";

import type { Action } from "@notemap/client";
import { json, refusal, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import { log } from "./log.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

afterEach(() => {
  log.forget();
});

type Row = Record<string, unknown>;

const AT = "2026-09-02T11%3A14%3A00.000Z";

function anAction(id: string): Row {
  return {
    id,
    kind: "captured",
    subject: "0198f0c2-item",
    by: { kind: "person" },
    at: "2026-09-02T11:14:00.000Z",
    detail: {},
  };
}

function answering(values: Row[], next?: string) {
  return pool((request: Request) =>
    routeOf(request) === "GET /v1/actions"
      ? json(200, { values, ...(next === undefined ? {} : { next }) })
      : json(200, { values: [] }),
  );
}

const reads = () =>
  asked().filter((route) => route === "GET /v1/actions").length;

const settled = () => vi.waitFor(() => expect(log.loading).toBe(false));

test("keeps a page it has answered rather than reading it again", async () => {
  answering([anAction("one")]);

  log.reading("newest-first", undefined);
  await settled();
  expect(reads()).toBe(1);

  // Coming back to a surface is not a reason to throw away a long walk.
  log.reading("newest-first", undefined);
  expect(reads()).toBe(1);
});

/**
 * The queue and the feed live through this on their cache, which the client
 * re-reads. This has none, so a read that failed and is never asked again is a
 * surface that stays blank until somebody reloads.
 */
test("asks again after a read the pool never answered", async () => {
  const transport = answering([anAction("one")]);
  transport.unreachable(true);

  log.reading("newest-first", undefined);
  await settled();
  expect(log.rows).toEqual([]);
  expect(log.quiet).toBe(false);

  transport.unreachable(false);
  log.reading("newest-first", undefined);
  await settled();

  expect(log.rows).toHaveLength(1);
});

test("asks again after a refusal, rather than sitting on a stale one", async () => {
  let refusing = true;
  pool((request: Request) =>
    routeOf(request) !== "GET /v1/actions"
      ? json(200, { values: [] })
      : refusing
        ? refusal(422, "bad-position")
        : json(200, { values: [anAction("one")] }),
  );

  log.reading("newest-first", undefined);
  await settled();
  expect(log.refused).toBeDefined();

  refusing = false;
  log.reading("newest-first", undefined);
  await settled();

  expect(log.refused).toBeUndefined();
  expect(log.rows).toHaveLength(1);
});

test("reads again when the pool comes back, and not before anything has asked", async () => {
  const transport = answering([anAction("one")]);

  // Nothing has been read yet, so there is nothing to read again.
  log.again();
  expect(reads()).toBe(0);

  transport.unreachable(true);
  log.reading("newest-first", undefined);
  await settled();

  transport.unreachable(false);
  log.again();
  await settled();

  expect(log.rows).toHaveLength(1);
});

test("leaves a page it holds alone when the pool comes back", async () => {
  answering([anAction("one")]);

  log.reading("newest-first", undefined);
  await settled();

  log.again();
  expect(reads()).toBe(1);
});

test("does not start a second read over one still walking", async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  pool(async (request: Request) => {
    if (routeOf(request) !== "GET /v1/actions")
      return json(200, { values: [] });
    await held;
    return json(200, { values: [anAction("one")] });
  });

  log.reading("newest-first", undefined);
  await vi.waitFor(() => expect(log.loading).toBe(true));

  log.reading("newest-first", undefined);
  log.again();
  log.next();
  expect(reads()).toBe(1);

  release();
  await settled();
});

/** A position belongs to the order that made it; two of them are not one list. */
test("turning it around drops the page and walks from the start", async () => {
  const transport = answering(
    [anAction("one")],
    `/v1/actions?after=${AT}%2Cone`,
  );

  log.reading("newest-first", undefined);
  await settled();
  expect(log.more).toBe(true);

  log.turn("oldest-first");
  await settled();

  expect(log.order).toBe("oldest-first");
  expect(log.rows).toHaveLength(1);

  const turned = new URL(transport.sent.at(-1)!.url).searchParams;
  expect(turned.get("order")).toBe("oldest-first");
  expect(turned.has("after")).toBe(false);
});

/**
 * A keyed block throws on a duplicate, which takes the surface down — the worst
 * thing a log can do to somebody working out what went wrong.
 */
test("keeps one row for an id a later page hands back again", async () => {
  answering([anAction("one")], `/v1/actions?after=${AT}%2Cone`);

  log.reading("newest-first", undefined);
  await settled();
  log.next();
  await settled();

  expect(log.rows.map((action) => action.id)).toEqual(["one"]);
});

test("a read that lands after a turn does not answer for the page it left", async () => {
  const answers: (() => void)[] = [];
  pool(async (request: Request) => {
    if (routeOf(request) !== "GET /v1/actions")
      return json(200, { values: [] });
    const which = answers.length;
    await new Promise<void>((resolve) => answers.push(resolve));
    return json(200, { values: [anAction(`page-${String(which)}`)] });
  });

  log.reading("newest-first", undefined);
  await vi.waitFor(() => expect(answers).toHaveLength(1));

  log.turn("oldest-first");
  await vi.waitFor(() => expect(answers).toHaveLength(2));

  // The first read lands last, and is answering for a log that no longer exists.
  answers[1]!();
  answers[0]!();
  await settled();

  expect(log.rows.map((action) => action.id)).toEqual(["page-1"]);
  expect(log.order).toBe("oldest-first");
});

test("forgetting drops the page and leaves nothing loading", async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  pool(async (request: Request) => {
    if (routeOf(request) !== "GET /v1/actions")
      return json(200, { values: [] });
    await held;
    return json(200, { values: [anAction("one")] });
  });

  log.reading("newest-first", undefined);
  await vi.waitFor(() => expect(log.loading).toBe(true));

  log.forget();

  expect(log.loading).toBe(false);
  expect(log.rows).toEqual([]);
  expect(log.shown).toBe(0);

  release();
  await vi.waitFor(() => expect(log.rows).toEqual([]));
  expect(log.loading).toBe(false);
});

test("tells a row the watcher brought from one a read brought, until the next read", async () => {
  answering([anAction("one")]);
  log.reading("newest-first", undefined);
  await settled();

  log.arrived([anAction("two"), anAction("one")] as unknown as Action[]);

  expect(log.heard("two")).toBe(true);
  expect(log.heard("one")).toBe(false);

  log.reading("newest-first", undefined, ["captured"]);
  expect(log.heard("two")).toBe(false);
});
