import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../adapters/memory-store";
import type { Action } from "#api/types";
import { createClient } from "../client";
import { Refused, saidBy, Unreachable } from "../errors";
import { asked, routeOf } from "#testing/pool";
import { json, mockTransport, refusal, type Handler } from "#testing/transport";

function clientOver(handler: Handler) {
  const transport = mockTransport(handler);
  const store = createMemoryStore();
  const client = createClient({ transport, store });
  return { client, store, transport };
}

function anAction(id: string, overrides: Partial<Action> = {}): Action {
  return {
    id,
    kind: "captured",
    subject: "0198f0c2-item",
    by: { kind: "person" },
    at: "2026-09-02T11:14:00.000Z",
    detail: {},
    ...overrides,
  };
}

const slice = (values: readonly Action[], next?: string) =>
  json(200, { values, ...(next === undefined ? {} : { next }) });

/** What the log read asked of the pool, as a query. */
function query(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

describe("reading the action log", () => {
  it("answers a page and the position the next one continues from", async () => {
    const { client } = clientOver(() =>
      slice(
        [anAction("one")],
        "/v1/actions?order=newest-first&limit=25&after=2026-09-02T11%3A14%3A00.000Z%2Cone",
      ),
    );

    await expect(
      client.actions.read({ order: "newest-first" }),
    ).resolves.toEqual({
      values: [anAction("one")],
      after: { at: "2026-09-02T11:14:00.000Z", id: "one" },
    });
  });

  it("leaves the position out on the last page, which is what says it is the last", async () => {
    const { client } = clientOver(() => slice([anAction("one")]));

    await expect(
      client.actions.read({ order: "newest-first" }),
    ).resolves.toEqual({ values: [anAction("one")] });
  });

  /** An id may hold a comma; an ISO 8601 instant may not, so the first one splits. */
  it("reads a position whose id holds a comma", async () => {
    const { client } = clientOver(() =>
      slice([], "/v1/actions?after=2026-09-02T11%3A14%3A00.000Z%2Cone%2Ctwo"),
    );

    const page = await client.actions.read({ order: "newest-first" });
    expect(page.after).toEqual({
      at: "2026-09-02T11:14:00.000Z",
      id: "one,two",
    });
  });

  it("continues from a position it is given, and never from a URL", async () => {
    const { client, transport } = clientOver(() => slice([]));

    await client.actions.read({
      order: "oldest-first",
      after: { at: "2026-09-02T11:14:00.000Z", id: "one" },
    });

    const [read] = asked(transport);
    expect(query(read!).get("after")).toBe("2026-09-02T11:14:00.000Z,one");
    expect(query(read!).get("order")).toBe("oldest-first");
  });

  /** A coarse entry point: the instant alone, with no row named. */
  it("continues from an instant with no id", async () => {
    const { client, transport } = clientOver(() => slice([]));

    await client.actions.read({
      order: "newest-first",
      after: { at: "2026-09-02T11:14:00.000Z" },
    });

    expect(query(asked(transport)[0]!).get("after")).toBe(
      "2026-09-02T11:14:00.000Z",
    );
  });

  it("narrows to one subject when it is given one, and asks for none otherwise", async () => {
    const { client, transport } = clientOver(() => slice([]));

    await client.actions.read({ order: "newest-first", item: "0198f0c2-item" });
    await client.actions.read({ order: "newest-first" });

    const [narrowed, everything] = asked(transport);
    expect(query(narrowed!).get("item")).toBe("0198f0c2-item");
    expect(query(everything!).has("item")).toBe(false);
  });

  it("surfaces a refusal as every other read does", async () => {
    const { client } = clientOver(() => refusal(422, "bad-position"));

    const failed = await client.actions
      .read({ order: "newest-first" })
      .catch((error: unknown) => error);

    expect(failed).toBeInstanceOf(Refused);
    expect(saidBy(failed)).toBe("the app lost its place in the list; reload");
  });

  it("says the pool is out of reach rather than answering an empty log", async () => {
    const { client, transport } = clientOver(() => slice([]));
    transport.unreachable(true);

    await expect(
      client.actions.read({ order: "newest-first" }),
    ).rejects.toBeInstanceOf(Unreachable);
  });

  /**
   * Diagnosis, not a surface to drain: what a reader has walked is theirs, and
   * the subjects it names are not the item cache filling itself behind them.
   */
  it("writes nothing to the store", async () => {
    const { client, store } = clientOver((request) =>
      routeOf(request) === "GET /v1/actions"
        ? slice([anAction("one")])
        : json(404, {}),
    );

    await client.actions.read({ order: "newest-first" });

    await expect(store.readItems()).resolves.toEqual([]);
  });
});
