import type {
  CapabilityName,
  DestinationId,
  Duration,
  EditEnvelope,
  EditOutcome,
  Item,
  ItemId,
  Page,
  PageRequest,
  Payload,
  Pool,
  Position,
} from "@notemap/core";
import { fakeCapability, fakeDestinations } from "@notemap/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  envelope,
  harness,
  itemRecord,
  SCRATCHPAD,
  tag,
  TEXT,
  upload,
  type Harness,
} from "./fixture";

const PERSON = { kind: "person" } as const;
const ALL: Page = { limit: 50 };
const OLDEST: PageRequest = { limit: 50, order: "oldest-first" };

const SHELL = "shell/web" as typeof SCRATCHPAD;

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

function edit(value: string, sourceItemId = "edit-1"): EditEnvelope {
  return { source: SHELL, sourceItemId, payload: text(value) };
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

/** An item routed and left in the queue's shadow, with the clock past the edit. */
async function processed(opened: Harness): Promise<Item> {
  const item = await captured(opened.pool);
  await opened.pool.routing.markProcessed(item.id, "pasted into the vault");
  opened.clock.set("2026-08-06T10:00:00.000Z");
  return item;
}

const VAULT = "vault" as DestinationId;

const RESERVED = {
  destination: VAULT,
  capability: "create-note" as CapabilityName,
  arguments: { path: "inbox/a-thought.md" },
};

/** An item whose delivery never landed: a reservation nothing has left through. */
async function reserved() {
  const opened = harness(
    undefined,
    "stub",
    fakeDestinations({
      answer: { kind: "unreachable", detail: "ECONNREFUSED" },
      capabilities: [fakeCapability({ name: "create-note" })],
    }),
  );
  open.push(opened);
  await opened.putDestination({ id: VAULT });

  const item = await captured(opened.pool);
  const record = succeeded(await opened.pool.routing.route(item.id, RESERVED));
  return { ...opened, item, record };
}

describe("amending an unprocessed item", () => {
  it("edits it in place however old it is, and whatever arrived since", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await captured(p);
    await captured(p, { id: "item-1", capturedAt: "2026-08-10T09:00:00.000Z" });
    await captured(p, { id: "item-2", capturedAt: "2026-08-13T09:00:00.000Z" });
    opened.clock.set("2026-08-13T10:00:00.000Z");

    const outcome = succeeded(
      await p.items.edit(item.id, edit("a second thought"), PERSON),
    );

    expect(outcome).toMatchObject({ kind: "amended" });
    const amended = await p.items.get(item.id);
    expect(amended?.payload.content).toEqual({ text: "a second thought" });
    expect(amended?.createdAt).toBe(item.createdAt);
    expect(amended?.contentUpdatedAt).toBe("2026-08-13T10:00:00.000Z");
    expect(amended?.revisedInto).toEqual([]);
  });

  it("leaves it where it sits in the queue, which orders on capture time", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const first = await captured(p);
    const second = await captured(p, {
      id: "item-1",
      capturedAt: "2026-08-06T09:01:00.000Z",
    });
    opened.clock.set("2026-08-06T10:00:00.000Z");

    await p.items.edit(first.id, edit("edited"), PERSON);

    expect(ids((await p.views.queue(OLDEST)).values)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("takes no source identity, so the edit's id is free for a later revision", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await captured(p);

    await p.items.edit(item.id, edit("edited"), PERSON);

    expect(await p.items.get(item.id)).toMatchObject({
      source: SCRATCHPAD,
      sourceItemId: "item-0",
    });
  });
});

describe("appending a revision", () => {
  it("revises a routed item, leaving its records behind", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await processed(opened);

    const outcome = succeeded(
      await p.items.edit(item.id, edit("again"), PERSON),
    );

    expect(outcome.kind).toBe("revised");
    expect(await p.routing.recordsFor(revision(outcome).id)).toEqual([]);
    expect(await p.routing.recordsFor(item.id)).toHaveLength(1);
  });

  it("revises an archived item, leaving the archive state behind", async () => {
    const { pool: p } = pool();
    const archived = await captured(p);
    await p.items.archive(archived.id);

    const outcome = succeeded(
      await p.items.edit(archived.id, edit("alive"), PERSON),
    );

    expect(outcome.kind).toBe("revised");
    expect(revision(outcome).archived).toBeUndefined();
    expect(ids((await p.views.archived(ALL)).values)).toEqual([archived.id]);
  });

  it("is an ordinary capture: its own id, time and source identity", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await processed(opened);

    const revised = revision(
      succeeded(await p.items.edit(item.id, edit("a second thought"), PERSON)),
    );

    expect(revised.id).not.toBe(item.id);
    expect(revised.revisionOf).toBe(item.id);
    expect(revised.payload.content).toEqual({ text: "a second thought" });
    expect(revised.createdAt).toBe("2026-08-06T10:00:00.000Z");
    expect(revised.contentUpdatedAt).toBeUndefined();
    expect(revised.source).toBe(SHELL);
    expect(revised.sourceItemId).toBe("edit-1");
  });

  it("carries the tags over, keeping their attribution", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await captured(p);
    await p.items.tag(item.id, tag("kind/quote"), {
      kind: "provider",
      provider: "tagger" as never,
    });
    await p.items.archive(item.id);

    const revised = revision(
      succeeded(await p.items.edit(item.id, edit("x"), PERSON)),
    );

    expect(revised.tags).toEqual([
      {
        name: "kind/quote",
        by: { kind: "provider", provider: "tagger" },
        addedAt: "2026-08-06T09:00:00.000Z",
      },
    ]);
  });

  it("arrives at the newest end of the feed and the queue, by its own time", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await processed(opened);
    const later = await captured(p, {
      id: "item-1",
      capturedAt: "2026-08-06T09:30:00.000Z",
    });

    const revised = revision(
      succeeded(await p.items.edit(item.id, edit("x"), PERSON)),
    );

    expect(ids((await p.views.feed(OLDEST)).values)).toEqual([
      item.id,
      later.id,
      revised.id,
    ]);
    expect(ids((await p.views.queue(OLDEST)).values)).toEqual([
      later.id,
      revised.id,
    ]);
  });

  it("pages the feed across the boundary without repeating or skipping a row", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await processed(opened);
    const revised = revision(
      succeeded(await p.items.edit(item.id, edit("x"), PERSON)),
    );

    const walked: ItemId[] = [];
    let after: Position | undefined;
    for (;;) {
      const page = await p.views.feed({
        limit: 1,
        order: "oldest-first",
        ...(after === undefined ? {} : { after }),
      });
      walked.push(...ids(page.values));
      if (page.next === undefined) break;
      after = page.next;
    }

    expect(walked).toEqual([item.id, revised.id]);
  });

  it("may be made twice from one item, into captures independent of each other", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await processed(opened);

    const first = revision(
      succeeded(await p.items.edit(item.id, edit("one", "edit-1"), PERSON)),
    );
    opened.clock.set("2026-08-06T11:00:00.000Z");
    const second = revision(
      succeeded(await p.items.edit(item.id, edit("two", "edit-2"), PERSON)),
    );

    expect(await p.items.get(item.id)).toMatchObject({
      revisedInto: [first.id, second.id],
    });
    expect(first.revisedInto).toEqual([]);
    expect(second.revisedInto).toEqual([]);
    expect(ids((await p.views.queue(OLDEST)).values)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("answers the revision it already made when the edit is replayed", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await processed(opened);

    const once = revision(
      succeeded(await p.items.edit(item.id, edit("a second thought"), PERSON)),
    );
    opened.clock.set("2026-08-06T11:00:00.000Z");
    const again = succeeded(
      await p.items.edit(item.id, edit("a second thought"), PERSON),
    );

    expect(again).toMatchObject({ kind: "revised", revisionOf: item.id });
    expect(revision(again).id).toBe(once.id);
    expect(await p.items.get(item.id)).toMatchObject({
      revisedInto: [once.id],
    });
  });

  it("refuses the same identity carrying different words", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await processed(opened);

    const once = revision(
      succeeded(await p.items.edit(item.id, edit("as it was sent"), PERSON)),
    );

    expect(
      await p.items.edit(item.id, edit("second thoughts"), PERSON),
    ).toMatchObject({
      kind: "refused",
      refusal: { kind: "source-item-changed", existing: once.id },
    });
    expect(await p.items.get(item.id)).toMatchObject({
      revisedInto: [once.id],
    });
  });

  it("refuses an identity that names something other than a revision of this item", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await processed(opened);
    const other = await captured(p, { id: "item-1", source: SHELL });

    expect(
      await p.items.edit(item.id, edit("x", other.sourceItemId), PERSON),
    ).toMatchObject({
      kind: "refused",
      refusal: { kind: "source-item-changed", existing: other.id },
    });
  });
});

describe("a decision that was withdrawn", () => {
  it("leaves an item something was revised from sealed", async () => {
    const opened = await reserved();
    const { pool: p, item } = opened;
    opened.clock.set("2026-08-06T10:00:00.000Z");

    expect(
      succeeded(await p.items.edit(item.id, edit("while it waits"), PERSON)),
    ).toMatchObject({ kind: "revised" });

    await p.routing.cancelDelivery(opened.record.id);

    expect(
      succeeded(await p.items.edit(item.id, edit("thawed", "edit-2"), PERSON)),
    ).toMatchObject({ kind: "revised" });
  });

  it("makes an unrevised item a person's to edit again", async () => {
    const opened = await reserved();
    const { pool: p, item } = opened;

    await p.routing.cancelDelivery(opened.record.id);
    // Nothing left, so the item is work again and a person's to rewrite.
    expect(
      succeeded(await p.items.edit(item.id, edit("thawed"), PERSON)),
    ).toMatchObject({ kind: "amended" });
  });
});

describe("what an edit refuses", () => {
  it("refuses an id no item has", async () => {
    const { pool: p } = pool();
    const missing = "nobody" as ItemId;

    expect(await p.items.edit(missing, edit("x"), PERSON)).toMatchObject({
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
        source: SHELL,
        sourceItemId: "edit-1",
        payload: { type: TEXT, content: { text: 7 }, metadata: {}, assets: [] },
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
          source: SHELL,
          sourceItemId: "edit-1",
          payload: {
            type: "note" as typeof TEXT,
            content: { body: "different" },
            metadata: {},
            assets: [],
          },
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
        source: SHELL,
        sourceItemId: "edit-1",
        payload: {
          type: TEXT,
          content: { text: "a thought" },
          metadata: {},
          assets: [
            { slot: "image", asset: "no-such-asset" as typeof stored.id },
          ],
        },
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

    await p.items.edit(item.id, edit("no picture after all"), PERSON);

    expect((await p.items.get(item.id))?.payload.assets).toEqual([]);
  });
});

describe("what an edit leaves behind", () => {
  it("logs an amendment and owes the mirror one write", async () => {
    const { pool: p } = pool();
    const item = await captured(p);
    await takeMirrorWork(p);

    await p.items.edit(item.id, edit("edited"), PERSON);

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
    const item = await processed(opened);
    await takeMirrorWork(p);

    const revised = revision(
      succeeded(await p.items.edit(item.id, edit("x"), PERSON)),
    );

    // The item it came from as well: it is processed now, which is a change a
    // client reading deltas has to learn about.
    expect(await takeMirrorWork(p)).toEqual([item.id, revised.id].sort());

    const logged = await p.actions.forItem(item.id, OLDEST);
    expect(logged.values.map((action) => action.kind)).toEqual([
      "captured",
      "routed",
      "revised",
    ]);
    expect(logged.values[2]).toMatchObject({
      by: { kind: "person" },
      detail: { revision: revised.id },
    });
  });

  it("mirrors the revision as an item of its own, with the tags it carried over", async () => {
    const opened = pool();
    const { pool: p } = opened;
    const item = await processed(opened);
    await p.items.tag(item.id, tag("kind/quote"), { kind: "person" });

    const revised = revision(
      succeeded(await p.items.edit(item.id, edit("x"), PERSON)),
    );

    const record = await itemRecord(p, revised.id);
    expect(record?.item.revisionOf).toBe(item.id);
    expect(record?.item.tags.map((held) => held.name)).toEqual(["kind/quote"]);
    expect(record?.item.createdAt).toBe("2026-08-06T10:00:00.000Z");
  });
});
