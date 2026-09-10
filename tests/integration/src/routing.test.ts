import { DatabaseSync } from "node:sqlite";

import type {
  CapabilityName,
  DestinationId,
  Destinations,
  Duration,
  Item,
  ItemId,
  Page,
  Pool,
  RoutingRecordId,
} from "@notemap/core";
import {
  fakeCapability,
  fakeDestinations,
  fakeKind,
} from "@notemap/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  bytes,
  deliverWith,
  drainWith,
  envelope,
  harness,
  itemRecord,
  SECOND,
  upload,
  type Harness,
} from "./fixture";

const ALL: Page = { limit: 50 };

const VAULT = "vault" as DestinationId;

const PATH_SCHEMA = {
  type: "object",
  required: ["path"],
  properties: { path: { type: "string" } },
  additionalProperties: false,
};

const open: Harness[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

const CAPABILITIES = [
  fakeCapability({ name: "create-note", argumentsSchema: PATH_SCHEMA }),
];

/**
 * A pool holding one destination, whose kind answers whatever the test tells it
 * to. The row is written first: a routing record refers to it.
 */
async function pooled(
  options: Parameters<typeof fakeDestinations>[0] = {},
  mirroring: Parameters<typeof harness>[1] = "stub",
) {
  const destination = fakeDestinations({
    capabilities: CAPABILITIES,
    ...options,
  });
  const opened = harness(undefined, mirroring, destination);
  open.push(opened);
  await opened.putDestination({ id: VAULT });
  return { ...opened, destination };
}

/** A pool holding one destination whose kind the test wrote by hand. */
async function pooledWith(kind: Partial<Destinations>) {
  const opened = harness(undefined, "stub", {
    kinds: () => [fakeKind()],
    describe: () => Promise.resolve({ capabilities: CAPABILITIES }),
    deliver: () => Promise.resolve(DELIVERED),
    candidates: () => Promise.reject(new Error("no candidates in this test")),
    naming: () => Promise.reject(new Error("no naming in this test")),
    preview: () => Promise.reject(new Error("no preview in this test")),
    probe: () => Promise.reject(new Error("no probe in this test")),
    ...kind,
  });
  open.push(opened);
  await opened.putDestination({ id: VAULT });
  return opened;
}

function captured(result: Awaited<ReturnType<Pool["capture"]>>): Item {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value.item;
}

function succeeded<T>(
  result: { kind: "ok"; value: T } | { kind: "refused"; refusal: unknown },
): T {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value;
}

const ids = (values: readonly Item[]) => values.map((item) => item.id);

const MINUTE = 60_000 as Duration;

function request(path = "inbox/a-thought.md") {
  return {
    destination: VAULT,
    capability: "create-note" as CapabilityName,
    arguments: { path },
  };
}

const DELIVERED = {
  kind: "delivered",
  pointer: "vault/inbox/a-thought.md",
} as const;

async function capture(pool: Pool, id = "item-1"): Promise<ItemId> {
  return captured(await pool.capture(envelope({ id }))).id;
}

const UNREACHABLE = { kind: "unreachable", detail: "ECONNREFUSED" } as const;

describe("routing to a destination that is up", () => {
  it("answers a delivered record with its pointer, and enqueues no delivery job", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answers(DELIVERED);
    const item = await capture(pool);

    const record = succeeded(await pool.routing.route(item, request()));

    expect(record).toMatchObject({
      item,
      state: "delivered",
      pointer: "vault/inbox/a-thought.md",
      target: {
        kind: "destination",
        destination: VAULT,
        capability: "create-note",
        arguments: { path: "inbox/a-thought.md" },
      },
    });
    expect(ids((await pool.views.queue(ALL)).values)).toEqual([]);
    expect(await deliverWith(opened, opened.destination)()).toBe(0);
  });

  it("hands the destination everything durable about the item", async () => {
    const opened = await pooled();
    const { pool } = opened;
    const item = await capture(pool);

    await pool.routing.route(item, request());

    const [handed] = opened.destination.received;
    expect(handed?.delivery).toMatchObject({
      item,
      destination: VAULT,
      capability: "create-note",
      arguments: { path: "inbox/a-thought.md" },
      source: "scratchpad",
      payload: { type: "text", content: { text: "a thought" } },
      tags: [],
      createdAt: "2026-08-06T09:00:00.000Z",
      artifacts: [],
      assets: [],
    });
  });

  it("records the routing in the log and owes the mirror a write", async () => {
    const opened = await pooled(undefined, "filesystem");
    const { pool } = opened;
    const item = await capture(pool);
    await drainWith(opened)();

    const record = succeeded(await pool.routing.route(item, request()));

    const logged = await pool.actions.forItem(item, {
      limit: 50,
      order: "newest-first",
    });
    expect(logged.values[0]).toMatchObject({
      kind: "routed",
      by: { kind: "person" },
      detail: { record: record.id, destination: VAULT },
    });
    expect(await drainWith(opened)()).toBe(1);
    expect((await itemRecord(pool, item))?.routing).toEqual([record]);
  });
});

describe("routing to a destination that refuses", () => {
  it("refuses the call, writes no record, and leaves the item in the queue", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answers({ kind: "rejected", detail: "not a vault" });
    const item = await capture(pool);

    const refusal = await pool.routing.route(item, request());

    expect(refusal).toEqual({
      kind: "refused",
      refusal: { kind: "rejected-by-destination", detail: "not a vault" },
    });
    expect(await pool.routing.recordsFor(item)).toEqual([]);
    expect(ids((await pool.views.queue(ALL)).values)).toEqual([item]);
  });

  it("leaves the failed attempt in the log", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answers({ kind: "rejected", detail: "not a vault" });
    const item = await capture(pool);

    await pool.routing.route(item, request());

    const logged = await pool.actions.forItem(item, {
      limit: 50,
      order: "newest-first",
    });
    expect(logged.values[0]).toMatchObject({
      kind: "delivery-failed",
      detail: {
        attempt: 1,
        failure: { code: "rejected-by-destination", detail: "not a vault" },
      },
    });
  });
});

describe("routing to a destination that could not be reached", () => {
  it("answers a pending record, takes the item out of the queue, and enqueues a job", async () => {
    const opened = await pooled({ answer: UNREACHABLE });
    const { pool } = opened;
    const item = await capture(pool);

    const record = succeeded(await pool.routing.route(item, request()));

    expect(record.state).toBe("pending");
    expect(record.pointer).toBeUndefined();
    expect(ids((await pool.views.queue(ALL)).values)).toEqual([]);

    const claimed = await pool.work.claim({
      kinds: ["delivery"],
      limit: 10,
      leaseFor: MINUTE,
    });
    expect(claimed.map((lease) => lease.job.subject)).toEqual([
      { kind: "routing-record", record: record.id },
    ]);
  });

  it("owes the mirror nothing, since a reservation is not durable state", async () => {
    const opened = await pooled({ answer: UNREACHABLE }, "filesystem");
    const { pool } = opened;
    const item = await capture(pool);
    await drainWith(opened)();

    await pool.routing.route(item, request());

    expect(await drainWith(opened)()).toBe(0);
    expect((await itemRecord(pool, item))?.routing).toEqual([]);
  });
});

describe("what routing refuses before it attempts anything", () => {
  it("a destination nothing is wired as", async () => {
    const { pool, destination } = await pooled();
    const item = await capture(pool);

    const refusal = await pool.routing.route(item, {
      ...request(),
      destination: "elsewhere" as DestinationId,
    });

    expect(refusal).toMatchObject({
      refusal: { kind: "unknown-destination", destination: "elsewhere" },
    });
    expect(destination.received).toEqual([]);
  });

  it("a capability the destination never declared", async () => {
    const { pool } = await pooled();
    const item = await capture(pool);

    expect(
      await pool.routing.route(item, {
        ...request(),
        capability: "post-to-board" as CapabilityName,
      }),
    ).toMatchObject({
      refusal: { kind: "capability-undeclared", capability: "post-to-board" },
    });
  });

  it("a payload type the capability does not accept", async () => {
    const { pool } = await pooled({
      capabilities: [
        fakeCapability({
          name: "create-note",
          accepts: [SECOND],
          argumentsSchema: PATH_SCHEMA,
        }),
      ],
    });
    const item = await capture(pool);

    expect(await pool.routing.route(item, request())).toMatchObject({
      refusal: {
        kind: "payload-type-unsupported",
        type: "text",
        accepts: [SECOND],
      },
    });
  });

  it("arguments its capability's schema rejects", async () => {
    const { pool, destination } = await pooled();
    const item = await capture(pool);

    const refusal = await pool.routing.route(item, {
      ...request(),
      arguments: { pth: "typo" },
    });

    expect(refusal).toMatchObject({ refusal: { kind: "arguments-invalid" } });
    expect(destination.received).toEqual([]);
  });

  it("an id no item has", async () => {
    const { pool } = await pooled();

    expect(
      await pool.routing.route("nobody" as ItemId, request()),
    ).toMatchObject({ refusal: { kind: "no-such-item", item: "nobody" } });
  });
});

/**
 * Delivery happens outside any transaction, so an item can be purged between
 * the attempt and the write that records it. The routing record is item state
 * and dies with the item; the entry saying bytes left the machine is a trace,
 * and the log carries no foreign key precisely so it outlives what it describes.
 */
describe("a destination that cannot say what it can do", () => {
  const undescribable = {
    describe: () => Promise.reject(new Error("the board is not answering")),
  };

  it("is reported as undescribable rather than dropped from the list", async () => {
    const opened = await pooledWith(undescribable);

    // Missing and unreachable are different answers to somebody looking for it.
    expect(
      (await opened.pool.destinations.list()).map((each) => each.id),
    ).toEqual([VAULT]);
    expect(await opened.pool.destinations.describe(VAULT)).toEqual({
      kind: "undescribable",
      detail: "the board is not answering",
    });
  });

  it("refuses a route to it, since no arguments can be checked against nothing", async () => {
    const opened = await pooledWith(undescribable);
    const item = await capture(opened.pool);

    const outcome = await opened.pool.routing.route(item, request());

    expect(outcome).toEqual({
      kind: "refused",
      refusal: { kind: "unreachable", detail: "the board is not answering" },
    });
    // Nothing was attempted, so the item never left the queue.
    expect(await opened.pool.routing.recordsFor(item)).toEqual([]);
  });
});

describe("an item purged while its delivery was in flight", () => {
  it("keeps the routed entry, writes no record, and refuses as purged", async () => {
    // Purge is not built, so the item goes the way a purge would take it —
    // and it goes *during* the attempt, which is the whole of the race.
    let purge = (): void => {};
    const opened = await pooledWith({
      deliver: async () => {
        purge();
        return DELIVERED;
      },
    });
    const item = await capture(opened.pool);
    purge = () => removeItem(opened.file, item);

    const outcome = await opened.pool.routing.route(item, request());

    expect(outcome).toMatchObject({ refusal: { kind: "item-purged", item } });
    const logged = await opened.pool.actions.forItem(item, {
      limit: 50,
      order: "newest-first",
    });
    expect(logged.values[0]).toMatchObject({
      kind: "routed",
      detail: { pointer: "vault/inbox/a-thought.md" },
    });
  });
});

/**
 * Aborting stops the waiting, not the destination, so the bytes may be there
 * already. Nothing may be retried on that, and the person about to route again
 * has to be able to find out that it happened.
 */
describe("an inline attempt that never answers", () => {
  it("refuses as unknown, writes no record, and leaves the item in the queue", async () => {
    const opened = await pooled({ answer: { kind: "hang" } });
    const item = await capture(opened.pool);
    const bounded = AbortSignal.abort();

    const outcome = await opened.pool.routing.route(item, request(), bounded);

    expect(outcome).toMatchObject({
      refusal: { kind: "delivery-outcome-unknown" },
    });
    expect(await opened.pool.routing.recordsFor(item)).toEqual([]);
    expect(ids((await opened.pool.views.queue(ALL)).values)).toEqual([item]);
  });

  it("leaves the attempt on the log, under the code that warrants a check", async () => {
    const opened = await pooled({ answer: { kind: "hang" } });
    const item = await capture(opened.pool);

    // Aborted while waiting, rather than before: the other way a host bounds it.
    await opened.pool.routing.route(item, request(), AbortSignal.timeout(5));

    const logged = await opened.pool.actions.forItem(item, {
      limit: 50,
      order: "newest-first",
    });
    expect(logged.values[0]).toMatchObject({
      kind: "delivery-failed",
      detail: {
        destination: VAULT,
        failure: { code: "delivery-outcome-unknown" },
      },
    });
  });

  it("enqueues nothing, so no machinery hands the destination a second copy", async () => {
    const opened = await pooled({ answer: { kind: "hang" } });
    const item = await capture(opened.pool);

    await opened.pool.routing.route(item, request(), AbortSignal.abort());
    opened.destination.answers(DELIVERED);

    expect(await deliverWith(opened, opened.destination)()).toBe(0);
    expect(opened.destination.received).toHaveLength(1);
  });

  /** An adapter that throws is the same unknown: core cannot see how far it got. */
  it("treats an adapter that throws the same way, carrying its message", async () => {
    const opened = await pooledWith({
      deliver: () => {
        throw new Error("socket closed mid-write");
      },
    });
    const item = await capture(opened.pool);

    expect(await opened.pool.routing.route(item, request())).toEqual({
      kind: "refused",
      refusal: {
        kind: "delivery-outcome-unknown",
        detail: "socket closed mid-write",
      },
    });
  });
});

describe("cancelling a delivery", () => {
  async function pending() {
    const opened = await pooled({ answer: UNREACHABLE });
    const item = await capture(opened.pool);
    const record = succeeded(await opened.pool.routing.route(item, request()));
    return { ...opened, item, record };
  }

  it("removes the reservation and returns the item to the queue", async () => {
    const { pool, item, record } = await pending();

    expect(await pool.routing.cancelDelivery(record.id)).toEqual({
      kind: "ok",
      value: undefined,
    });
    expect(await pool.routing.recordsFor(item)).toEqual([]);
    expect(ids((await pool.views.queue(ALL)).values)).toEqual([item]);
  });

  it("takes the job with it, so nothing delivers afterwards", async () => {
    const opened = await pending();

    await opened.pool.routing.cancelDelivery(opened.record.id);

    expect(await deliverWith(opened, opened.destination)()).toBe(0);
  });

  it("records the cancellation in the log", async () => {
    const { pool, item, record } = await pending();

    await pool.routing.cancelDelivery(record.id);

    const logged = await pool.actions.forItem(item, {
      limit: 50,
      order: "newest-first",
    });
    expect(logged.values[0]).toMatchObject({
      kind: "delivery-cancelled",
      by: { kind: "person" },
      detail: { record: record.id },
    });
  });

  it("refuses a record that already delivered, which is not a promise to break", async () => {
    const opened = await pooled();
    const { pool } = opened;
    const item = await capture(pool);
    const record = succeeded(await pool.routing.route(item, request()));

    expect(await pool.routing.cancelDelivery(record.id)).toMatchObject({
      refusal: { kind: "not-pending", record: record.id },
    });
    expect(await pool.routing.recordsFor(item)).toEqual([record]);
  });

  it("refuses a record no decision minted", async () => {
    const { pool } = await pooled();

    expect(
      await pool.routing.cancelDelivery("nobody" as RoutingRecordId),
    ).toMatchObject({ refusal: { kind: "no-such-record", record: "nobody" } });
  });

  /** Whoever holds the lease may be halfway through the attempt. */
  it("refuses while somebody holds the delivery", async () => {
    const { pool, record } = await pending();
    await pool.work.claim({ kinds: ["delivery"], limit: 1, leaseFor: MINUTE });

    expect(await pool.routing.cancelDelivery(record.id)).toMatchObject({
      refusal: { kind: "delivery-in-flight", record: record.id },
    });
  });
});

describe("the assets a delivery carries", () => {
  const NOTE_WITH_RECORDING = {
    type: SECOND,
    content: { body: "a thought" },
    metadata: {},
  };

  async function withAssets(reads: boolean) {
    const opened = await pooled({
      reads,
      capabilities: [
        fakeCapability({
          name: "create-note",
          accepts: [SECOND],
          argumentsSchema: PATH_SCHEMA,
        }),
      ],
    });

    const audio = await upload(
      opened.pool,
      "interview with mum.opus",
      new Uint8Array([0xff, 0xfe, 0x00, 0x80]),
      "audio/opus",
    );
    const photo = await upload(opened.pool, "café.png", bytes("png-bytes"));

    const item = captured(
      await opened.pool.capture({
        ...envelope({ id: "item-1" }),
        payload: {
          ...NOTE_WITH_RECORDING,
          type: SECOND,
          assets: [
            { slot: "recording", asset: audio.id },
            { slot: "photo", asset: photo.id },
          ],
        },
      }),
    ).id;

    return { ...opened, item, audio, photo };
  }

  it("arrives whole: every reference, under the name it was uploaded with", async () => {
    const opened = await withAssets(true);

    await opened.pool.routing.route(opened.item, request());

    const [handed] = opened.destination.received;
    expect(handed?.assets).toEqual([
      {
        slot: "photo",
        filename: "café.png",
        bytes: bytes("png-bytes"),
      },
      {
        slot: "recording",
        filename: "interview with mum.opus",
        // Not valid UTF-8, and it survives regardless.
        bytes: new Uint8Array([0xff, 0xfe, 0x00, 0x80]),
      },
    ]);
  });

  it("opens no stream for a capability that wants no bytes", async () => {
    const opened = await withAssets(false);
    const before = opened.blobOpens();

    await opened.pool.routing.route(opened.item, request());

    expect(opened.destination.received[0]?.delivery.assets).toHaveLength(2);
    expect(opened.blobOpens()).toBe(before);
  });
});

/**
 * A routing record's destination is a real reference now, so the check the
 * schema makes is worth making from outside it: nothing a route writes may name
 * a row that is not there.
 */
describe("a delivery carrying words of its own", () => {
  it("hands over the supplied words and leaves the item saying what it said", async () => {
    const opened = await pooled();
    const { pool } = opened;
    const item = await capture(pool);

    succeeded(
      await pool.routing.route(item, {
        ...request(),
        content: { text: "a thought, tidied" },
      }),
    );

    const [handed] = opened.destination.received;
    expect(handed?.delivery.payload).toMatchObject({
      type: "text",
      content: { text: "a thought, tidied" },
    });
    expect((await pool.items.get(item))?.payload.content).toEqual({
      text: "a thought",
    });
  });

  /** The whole point: one capture, two destinations, two wordings, neither overwriting the other. */
  it("leaves two records holding two different rewrites", async () => {
    const opened = await pooled();
    const { pool } = opened;
    const item = await capture(pool);

    await pool.routing.route(item, {
      ...request("inbox/one.md"),
      content: { text: "for the log" },
    });
    await pool.routing.route(item, {
      ...request("inbox/two.md"),
      content: { text: "for the project" },
    });

    const records = await pool.routing.recordsFor(item);
    expect(
      records.map((record) =>
        record.target.kind === "destination"
          ? record.target.content
          : undefined,
      ),
    ).toEqual([{ text: "for the log" }, { text: "for the project" }]);
    expect(
      opened.destination.received.map((each) => each.delivery.payload.content),
    ).toEqual([{ text: "for the log" }, { text: "for the project" }]);
  });

  it("carries the capture's own words where the request supplies none", async () => {
    const opened = await pooled();
    const { pool } = opened;
    const item = await capture(pool);

    const record = succeeded(await pool.routing.route(item, request()));

    expect(record.target).not.toHaveProperty("content");
    expect(opened.destination.received[0]?.delivery.payload.content).toEqual({
      text: "a thought",
    });
  });

  /** The reservation holds the words, which is the whole of what a retry has to go on. */
  it("replays the rewrite when the delivery is carried out later", async () => {
    const opened = await pooled({ answer: UNREACHABLE });
    const { pool } = opened;
    const item = await capture(pool);

    succeeded(
      await pool.routing.route(item, {
        ...request(),
        content: { text: "a thought, tidied" },
      }),
    );
    opened.destination.answers(DELIVERED);

    expect(await deliverWith(opened, opened.destination)()).toBe(1);
    expect(
      opened.destination.received.at(-1)?.delivery.payload.content,
    ).toEqual({ text: "a thought, tidied" });
  });

  it("refuses words the payload type will not have, before anything is written", async () => {
    const opened = await pooled();
    const { pool } = opened;
    const item = await capture(pool);

    const refusal = await pool.routing.route(item, {
      ...request(),
      content: { text: 42 },
    });

    expect(refusal).toMatchObject({ refusal: { kind: "content-invalid" } });
    expect(
      refusal.kind === "refused" && refusal.refusal.kind === "content-invalid"
        ? refusal.refusal.issues.length
        : 0,
    ).toBeGreaterThan(0);
    expect(opened.destination.received).toEqual([]);
    expect(await pool.routing.recordsFor(item)).toEqual([]);
    expect(ids((await pool.views.queue(ALL)).values)).toEqual([item]);
  });

  it("refuses a preview of words the payload type will not have", async () => {
    const opened = await pooledWith({
      preview: () => Promise.resolve({ note: "nothing was asked" }),
    });

    const item = await capture(opened.pool);

    expect(
      await opened.pool.routing.preview(item, {
        ...request(),
        content: { text: 42 },
      }),
    ).toMatchObject({ refusal: { kind: "content-invalid" } });
  });
});

describe("what a route leaves in the database", () => {
  it("leaves every reference resolving", async () => {
    const opened = await pooled();
    const item = await capture(opened.pool);
    await opened.pool.routing.route(item, request());

    const raw = new DatabaseSync(opened.file, { readOnly: true });
    try {
      expect(raw.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      raw.close();
    }
  });
});

/** What purge will do, before purge exists to do it. */
function removeItem(file: string, item: ItemId): void {
  const raw = new DatabaseSync(file);
  try {
    raw.exec("PRAGMA foreign_keys = ON");
    raw.prepare("DELETE FROM items WHERE id = ?").run(item);
  } finally {
    raw.close();
  }
}
