import type {
  Duration,
  EditOutcome,
  Item,
  ItemId,
  Page,
  PageRequest,
  Payload,
  Pool,
  Position,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  envelope,
  harness,
  itemRecord,
  tag,
  TEXT,
  upload,
  type Harness,
} from "./fixture";

const PERSON = { kind: "person" } as const;
const ALL: Page = { limit: 50 };
const OLDEST: PageRequest = { limit: 50, order: "oldest-first" };

const open: Harness[] = [];

function pool(): Harness {
  const opened = harness();
  open.push(opened);
  return opened;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

function succeeded<T>(
  result: { kind: "ok"; value: T } | { kind: "refused"; refusal: unknown },
): T {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value;
}

async function captured(
  p: Pool,
  overrides: Parameters<typeof envelope>[0] = {},
): Promise<Item> {
  const id = overrides.id ?? "item-0";
  return succeeded(
    await p.capture(envelope({ sourceItemId: id, ...overrides, id })),
  ).item;
}

function text(value: string): Payload {
  return { type: TEXT, content: { text: value }, metadata: {}, assets: [] };
}

function revision(outcome: EditOutcome): Item {
  if (outcome.kind !== "revised") {
    throw new Error(`expected a revision, got ${outcome.kind}`);
  }
  return outcome.revision;
}

/** What the mirror is owed, taken rather than read, so the next call answers what came after. */
async function takeMirrorWork(p: Pool): Promise<readonly ItemId[]> {
  const leases = await p.work.claim({
    kinds: ["mirror"],
    limit: 50,
    leaseFor: 60_000 as Duration,
  });
  for (const lease of leases) {
    await p.work.complete(lease.id, { kind: "succeeded" });
  }

  return leases
    .flatMap((lease) =>
      lease.job.subject.kind === "item" ? [lease.job.subject.item] : [],
    )
    .sort();
}

const ids = (values: readonly Item[]) => values.map((item) => item.id);

/** An item a later capture has taken the head from, with the clock past both. */
async function sealed(opened: Harness): Promise<Item> {
  const item = await captured(opened.pool);
  await captured(opened.pool, {
    id: "item-1",
    capturedAt: "2026-08-06T09:01:00.000Z",
  });
  opened.clock.set("2026-08-06T09:02:00.000Z");
  return item;
}

describe("amending the head", () => {
  it("edits the unprocessed head in place", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await captured(p);
    opened.clock.set("2026-08-06T10:00:00.000Z");

    const outcome = succeeded(
      await p.items.edit(item.id, text("a second thought"), PERSON),
    );

    expect(outcome).toMatchObject({ kind: "amended" });
    const amended = await p.items.get(item.id);
    expect(amended?.payload.content).toEqual({ text: "a second thought" });
    expect(amended?.createdAt).toBe(item.createdAt);
    expect(amended?.contentUpdatedAt).toBe("2026-08-06T10:00:00.000Z");
    expect(ids((await p.views.feed(ALL)).values)).toEqual([item.id]);
  });

  it("moves the amended item in the queue, which orders on last touch", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const first = await captured(p);
    const second = await captured(p, {
      id: "item-1",
      capturedAt: "2026-08-06T09:01:00.000Z",
    });
    opened.clock.set("2026-08-06T10:00:00.000Z");

    // The second is the head, so this amends rather than revising.
    await p.items.edit(second.id, text("edited"), PERSON);

    expect(ids((await p.views.queue(ALL)).values)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("seals the head only when a later capture takes it", async () => {
    const { pool: p } = pool();
    const item = await captured(p);
    // Earlier in the feed by its source time, the way a file import arrives.
    await captured(p, {
      id: "item-early",
      capturedAt: "2026-08-05T09:00:00.000Z",
    });

    expect(
      succeeded(await p.items.edit(item.id, text("still open"), PERSON)),
    ).toMatchObject({ kind: "amended" });
  });

  it("revises a processed head rather than amending it", async () => {
    const { pool: p } = pool();
    const archived = await captured(p);
    await p.items.archive(archived.id);

    const outcome = succeeded(
      await p.items.edit(archived.id, text("alive"), PERSON),
    );

    expect(outcome.kind).toBe("revised");
    // Editing says the item is alive again: the archive state stays behind.
    expect(revision(outcome).archived).toBeUndefined();
    expect(ids((await p.views.archived(ALL)).values)).toEqual([archived.id]);
  });

  it("revises a routed head, since a routing record processes it", async () => {
    const { pool: p } = pool();
    const item = await captured(p);
    await p.routing.markProcessed(item.id, "pasted into the vault");

    const outcome = succeeded(
      await p.items.edit(item.id, text("again"), PERSON),
    );

    expect(outcome.kind).toBe("revised");
    // The records are the original's history and stay with it, so the revision
    // starts unprocessed.
    expect(await p.routing.recordsFor(revision(outcome).id)).toEqual([]);
    expect(await p.routing.recordsFor(item.id)).toHaveLength(1);
  });
});

describe("appending a revision", () => {
  it("appends one once a later capture has taken the head", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await sealed(opened);
    opened.clock.set("2026-08-06T10:00:00.000Z");

    const revised = revision(
      succeeded(await p.items.edit(item.id, text("a second thought"), PERSON)),
    );

    expect(revised.id).not.toBe(item.id);
    expect(revised.revisionOf).toBe(item.id);
    expect(revised.payload.content).toEqual({ text: "a second thought" });
    // The original's capture time and source identity, plus the edit's time.
    expect(revised.createdAt).toBe(item.createdAt);
    expect(revised.contentUpdatedAt).toBe("2026-08-06T10:00:00.000Z");
    expect(revised.source).toBe(item.source);
    expect(revised.sourceItemId).toBe(item.sourceItemId);
  });

  it("carries the tags over, keeping their attribution", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await sealed(opened);
    await p.items.tag(item.id, tag("kind/quote"), {
      kind: "provider",
      provider: "tagger" as never,
    });

    const revised = revision(
      succeeded(await p.items.edit(item.id, text("x"), PERSON)),
    );

    expect(revised.tags).toEqual([
      {
        name: "kind/quote",
        by: { kind: "provider", provider: "tagger" },
        addedAt: "2026-08-06T09:02:00.000Z",
      },
    ]);
  });

  it("ties with its original in the feed and follows it by the link, not the id", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await sealed(opened);

    const revised = revision(
      succeeded(await p.items.edit(item.id, text("x"), PERSON)),
    );

    // Minted ids sort ahead of the ids these captures were given, so an order
    // that broke the tie on id would put the revision first.
    expect(revised.id < item.id).toBe(true);
    expect(ids((await p.views.feed(OLDEST)).values)).toEqual([
      item.id,
      revised.id,
      "item-1",
    ]);
    expect(ids((await p.views.feed(ALL)).values)).toEqual([
      "item-1",
      revised.id,
      item.id,
    ]);
  });

  it("pages the feed through a chain without repeating or skipping a row", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await sealed(opened);
    const revised = revision(
      succeeded(await p.items.edit(item.id, text("x"), PERSON)),
    );

    const seen: ItemId[] = [];
    let after: Position | undefined;
    for (;;) {
      const page = await p.views.queue({
        limit: 1,
        ...(after === undefined ? {} : { after }),
      });
      seen.push(...ids(page.values));
      if (page.next === undefined) break;
      after = page.next;
    }
    expect(seen).toEqual(["item-1", revised.id]);

    const walked: ItemId[] = [];
    let feedAfter: Position | undefined;
    for (;;) {
      const page = await p.views.feed({
        limit: 1,
        order: "oldest-first",
        ...(feedAfter === undefined ? {} : { after: feedAfter }),
      });
      walked.push(...ids(page.values));
      if (page.next === undefined) break;
      feedAfter = page.next;
    }
    expect(walked).toEqual([item.id, revised.id, "item-1"]);
  });

  it("takes the original out of the queue and puts the revision in it", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await sealed(opened);

    const revised = revision(
      succeeded(await p.items.edit(item.id, text("x"), PERSON)),
    );

    expect((await p.items.get(item.id))?.supersededBy).toBe(revised.id);
    expect(ids((await p.views.queue(ALL)).values)).toEqual([
      "item-1",
      revised.id,
    ]);
  });

  it("stays behind a later capture, so a chain goes on growing", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await sealed(opened);

    // A revision carries the capture time it revises, so it never overtakes the
    // capture that sealed it: the head is still `item-1`, and editing again
    // extends the chain rather than amending its end.
    const second = revision(
      succeeded(await p.items.edit(item.id, text("x"), PERSON)),
    );
    const third = revision(
      succeeded(await p.items.edit(second.id, text("y"), PERSON)),
    );

    expect(third.revisionOf).toBe(second.id);
    expect(ids((await p.views.feed(OLDEST)).values)).toEqual([
      item.id,
      second.id,
      third.id,
      "item-1",
    ]);
    expect(ids((await p.views.queue(ALL)).values)).toEqual([
      "item-1",
      third.id,
    ]);
  });

  it("refuses to edit a superseded item, so the chain cannot fork", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await sealed(opened);
    const revised = revision(
      succeeded(await p.items.edit(item.id, text("x"), PERSON)),
    );

    expect(await p.items.edit(item.id, text("y"), PERSON)).toMatchObject({
      kind: "refused",
      refusal: { kind: "item-superseded", by: revised.id },
    });
  });
});

describe("what an edit refuses", () => {
  it("refuses an id no item has", async () => {
    const { pool: p } = pool();
    const missing = "nobody" as ItemId;

    expect(await p.items.edit(missing, text("x"), PERSON)).toMatchObject({
      kind: "refused",
      refusal: { kind: "no-such-item", item: missing },
    });
  });

  it("refuses a payload that does not satisfy its type's schema", async () => {
    const { pool: p } = pool();
    const item = await captured(p);

    const refused = await p.items.edit(
      item.id,
      {
        type: TEXT,
        content: { text: 7 },
        metadata: {},
        assets: [],
      },
      PERSON,
    );

    expect(refused).toMatchObject({
      kind: "refused",
      refusal: { kind: "payload-invalid" },
    });
    expect((await p.items.get(item.id))?.payload.content).toEqual({
      text: "a thought",
    });
  });

  it("refuses a payload whose type is not the one the item was captured as", async () => {
    const { pool: p } = pool();
    const item = await captured(p);

    expect(
      await p.items.edit(
        item.id,
        {
          type: "note" as typeof TEXT,
          content: { body: "different" },
          metadata: {},
          assets: [],
        },
        PERSON,
      ),
    ).toMatchObject({
      kind: "refused",
      refusal: { kind: "payload-type-changed", from: TEXT },
    });
  });

  it("refuses an attachment the pool does not hold, and keeps the ones it does", async () => {
    const { pool: p } = pool();
    const stored = await upload(p, "a.png", new Uint8Array([1, 2, 3]));
    const item = await captured(p, {
      assets: [{ slot: "image", asset: stored.id }],
    });

    const refused = await p.items.edit(
      item.id,
      {
        type: TEXT,
        content: { text: "a thought" },
        metadata: {},
        assets: [{ slot: "image", asset: "no-such-asset" as typeof stored.id }],
      },
      PERSON,
    );

    expect(refused).toMatchObject({
      kind: "refused",
      refusal: { kind: "unknown-asset", asset: "no-such-asset" },
    });
    expect((await p.items.get(item.id))?.payload.assets).toEqual([
      { slot: "image", asset: stored.id },
    ]);
  });

  it("replaces the references an amendment carries", async () => {
    const { pool: p } = pool();
    const stored = await upload(p, "a.png", new Uint8Array([1, 2, 3]));
    const item = await captured(p, {
      assets: [{ slot: "image", asset: stored.id }],
    });

    await p.items.edit(item.id, text("no picture after all"), PERSON);

    expect((await p.items.get(item.id))?.payload.assets).toEqual([]);
  });
});

describe("what an edit leaves behind", () => {
  it("logs an amendment and owes the mirror one write", async () => {
    const { pool: p } = pool();
    const item = await captured(p);
    await takeMirrorWork(p);

    await p.items.edit(item.id, text("edited"), PERSON);

    expect(await takeMirrorWork(p)).toEqual([item.id]);
    const logged = await p.actions.forItem(item.id, OLDEST);
    expect(logged.values.map((action) => action.kind)).toEqual([
      "captured",
      "amended",
    ]);
    expect(logged.values[1]).toMatchObject({ by: { kind: "person" } });
  });

  it("logs a revision against the item that was edited, and owes both writes", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await sealed(opened);
    await takeMirrorWork(p);

    const revised = revision(
      succeeded(await p.items.edit(item.id, text("x"), PERSON)),
    );

    // The original as well: it is superseded now, which is a change a client
    // reading deltas has to learn about.
    expect(await takeMirrorWork(p)).toEqual([item.id, revised.id].sort());

    const logged = await p.actions.forItem(item.id, OLDEST);
    expect(logged.values.map((action) => action.kind)).toEqual([
      "captured",
      "revised",
    ]);
    expect(logged.values[1]).toMatchObject({
      by: { kind: "person" },
      detail: { revision: revised.id },
    });
  });

  it("mirrors the revision as an item of its own, with the tags it carried over", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await sealed(opened);
    await p.items.tag(item.id, tag("kind/quote"), { kind: "person" });

    const revised = revision(
      succeeded(await p.items.edit(item.id, text("x"), PERSON)),
    );

    const record = await itemRecord(p, revised.id);
    expect(record?.item.revisionOf).toBe(item.id);
    expect(record?.item.tags.map((held) => held.name)).toEqual(["kind/quote"]);
    expect(record?.item.createdAt).toBe(item.createdAt);
  });
});
