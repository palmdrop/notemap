import { describe, expect, it } from "vitest";

import { archive } from "#outbox/kinds/archive";
import { unarchive } from "#outbox/kinds/unarchive";
import { anItem } from "#testing/pool";
import type { Action, Item } from "#api/types";
import {
  arrived,
  caughtUp,
  emptyState,
  forgotten,
  rebuilt,
  settle,
  type ClientState,
  type ListPage,
} from "./state";

const PERSON = { kind: "person" } as const;
const AT = "2026-08-17T11:00:00.000Z";

function archived(state: ClientState, id: string) {
  if (archive.apply === undefined) throw new Error("archive applies nothing");
  return archive.apply(state, { kind: "archive", item: id }, AT);
}

function unarchived(state: ClientState, id: string) {
  if (unarchive.apply === undefined)
    throw new Error("unarchive applies nothing");
  return unarchive.apply(state, { kind: "unarchive", item: id }, AT);
}

function item(id: string, minute: number, ...tags: string[]): Item {
  const at = `2026-08-17T10:0${String(minute)}:00.000Z`;
  return anItem(id, {
    createdAt: at,
    tags: tags.map((name) => ({ name, by: PERSON, addedAt: at })),
  });
}

function page(
  order: ListPage["order"],
  ids: readonly string[],
  filter?: readonly string[],
): ListPage {
  return {
    order,
    ...(filter === undefined ? {} : { filter }),
    ids,
    exhausted: true,
    loading: false,
    answered: true,
  };
}

const ONE = item("one", 1, "kind/quote");
const TWO = item("two", 2, "project/a");
const THREE = item("three", 3, "kind/quote", "project/a");

/** The queue and the feed read whole, and the queue and the feed filtered by `kind/quote`. */
function holding(...items: readonly Item[]): ClientState {
  const ids = items.map((one) => one.id);
  const quoted = items
    .filter((one) => one.tags?.some((tag) => tag.name === "kind/quote"))
    .map((one) => one.id);
  return {
    ...emptyState(),
    items: new Map(items.map((one) => [one.id, one])),
    queue: page("oldest-first", ids),
    feed: page("oldest-first", ids),
    filtered: {
      queue: page("oldest-first", quoted, ["kind/quote"]),
      feed: page("oldest-first", quoted, ["kind/quote"]),
    },
  };
}

describe("archiving on a filtered queue", () => {
  it("takes the row off both pages, and puts it back where it stood on undo", () => {
    const state = holding(ONE, TWO, THREE);

    const out = archived(state, "one");
    expect(out.state.queue.ids).toEqual(["two", "three"]);
    expect(out.state.filtered.queue?.ids).toEqual(["three"]);

    const back = out.undo?.(out.state);
    expect(back?.queue.ids).toEqual(["one", "two", "three"]);
    expect(back?.filtered.queue?.ids).toEqual(["one", "three"]);
  });

  it("leaves a filtered page read through another filter since alone on undo", () => {
    const out = archived(holding(ONE, TWO, THREE), "one");
    const refiltered: ClientState = {
      ...out.state,
      filtered: { queue: page("oldest-first", ["two"], ["project/a"]) },
    };

    const back = out.undo?.(refiltered);
    expect(back?.queue.ids).toEqual(["one", "two", "three"]);
    expect(back?.filtered.queue?.ids).toEqual(["two"]);
  });
});

describe("unarchiving", () => {
  const ARCHIVED = { archivedAt: AT };

  it("returns an unrouted item to the queue, and to a filter it is carried into", () => {
    const state = holding(TWO, THREE, { ...ONE, archived: ARCHIVED });
    const off: ClientState = {
      ...state,
      queue: page("oldest-first", ["two", "three"]),
      filtered: { queue: page("oldest-first", ["three"], ["kind/quote"]) },
    };

    const back = unarchived(off, "one");

    expect(back.state.queue.ids).toEqual(["one", "two", "three"]);
    expect(back.state.filtered.queue?.ids).toEqual(["one", "three"]);
  });

  it("does not return a routed item to the queue: it is still processed", () => {
    const routed = {
      ...ONE,
      archived: ARCHIVED,
      routing: {
        records: 1,
        pending: 0,
        to: [{ kind: "user" as const }],
        templates: [],
      },
    };
    const state: ClientState = {
      ...holding(TWO, THREE),
      items: new Map([
        ["one", routed],
        ["two", TWO],
        ["three", THREE],
      ]),
      queue: page("oldest-first", ["two", "three"]),
    };

    const back = unarchived(state, "one");

    expect(back.state.queue.ids).toEqual(["two", "three"]);
  });
});

describe("an item settled or arriving", () => {
  it("joins the whole feed and a filtered page it carries the tags of, where they reach", () => {
    const state = holding(ONE, THREE);

    const settled = settle(state, item("two", 2, "kind/quote"));

    expect(settled.feed.ids).toEqual(["one", "two", "three"]);
    expect(settled.filtered.feed?.ids).toEqual(["one", "two", "three"]);
    expect(settled.filtered.queue?.ids).toEqual(["one", "two", "three"]);
  });

  it("joins no filtered page whose tags it does not carry", () => {
    const state = holding(ONE, THREE);

    const landed = arrived(state, TWO);

    expect(landed.feed.ids).toEqual(["one", "two", "three"]);
    expect(landed.queue.ids).toEqual(["one", "two", "three"]);
    expect(landed.filtered.feed?.ids).toEqual(["one", "three"]);
  });
});

describe("tags from the log", () => {
  function action(
    kind: "tagged" | "untagged",
    subject: string,
    tag: string,
    by: Action["by"] = PERSON,
  ): Action {
    return {
      id: `${kind}-${subject}`,
      kind,
      subject,
      by,
      at: AT,
      detail: { tag },
    } as Action;
  }

  it("ignores a tag it says notemap added, notemap tagging nothing", () => {
    const state = holding(ONE, TWO, THREE);

    const after = caughtUp(state, [
      action("tagged", "two", "kind/quote", { kind: "notemap" }),
    ]);

    expect(after.items.get("two")?.tags?.map((tag) => tag.name)).toEqual([
      "project/a",
    ]);
    expect(after.filtered.queue?.ids).toEqual(["one", "three"]);
  });

  it("does not undo a change to the same tag this client has still to send", () => {
    const untagged = { ...ONE, tags: [] };
    const state: ClientState = {
      ...holding(untagged, TWO, THREE),
      outbox: [
        {
          id: "op-1",
          operation: { kind: "untag", item: "one", tag: "kind/quote" },
          at: "2026-08-17T11:30:00.000Z",
          state: "sending",
        },
      ],
    };

    const after = caughtUp(state, [action("tagged", "one", "kind/quote")]);

    expect(after.items.get("one")?.tags).toEqual([]);
    expect(after.filtered.queue?.ids).toEqual(["three"]);
  });
});

describe("a pool changed or signed out of", () => {
  it("keeps each surface read through the filter its address names, emptied", () => {
    const state = holding(ONE, TWO, THREE);

    for (const after of [
      rebuilt(state, { id: "other" } as never),
      forgotten(state),
    ]) {
      expect(after.filtered.queue?.filter).toEqual(["kind/quote"]);
      expect(after.filtered.queue?.ids).toEqual([]);
      expect(after.filtered.feed?.answered).toBe(false);
    }
  });
});
