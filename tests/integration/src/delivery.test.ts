import type {
  AbandonedWork,
  CapabilityName,
  DestinationId,
  Duration,
  Item,
  ItemId,
  Page,
  Pool,
  RoutingRecord,
} from "@notemap/core";
import { fakeCapability, fakeDestination } from "@notemap/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  at,
  deliverWith,
  drainWith,
  envelope,
  harness,
  storedRecords,
  type Harness,
} from "./fixture";

const ALL: Page = { limit: 50 };
const MINUTE = 60_000 as Duration;

const VAULT = "vault" as DestinationId;

const REQUEST = {
  destination: VAULT,
  capability: "create-note" as CapabilityName,
  target: { path: "inbox/a-thought.md" },
};

const UNREACHABLE = { kind: "unreachable", detail: "ECONNREFUSED" } as const;

const DELIVERED = {
  kind: "delivered",
  at: at("2026-08-06T09:05:00.000Z"),
  pointer: "vault/inbox/a-thought.md",
} as const;

const open: Harness[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

const ids = (values: readonly Item[]) => values.map((item) => item.id);

/**
 * An item routed to a destination that was not there: a reservation, a job, and
 * an item that has left the queue although nothing has arrived.
 */
async function pending() {
  const destination = fakeDestination({
    answer: UNREACHABLE,
    capabilities: [fakeCapability({ name: "create-note" })],
  });
  const opened = harness(undefined, "filesystem", [destination]);
  open.push(opened);

  const captured = await opened.pool.capture(envelope({ id: "item-1" }));
  if (captured.kind === "refused") throw new Error("expected a capture");
  const item = captured.value.item.id;

  const routed = await opened.pool.routing.route(item, REQUEST);
  if (routed.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(routed.refusal)}`);
  }

  return {
    ...opened,
    destination,
    item,
    record: routed.value,
    deliver: deliverWith(opened, destination),
  };
}

/** Every attempt after the first is behind a backoff, so the clock has to move. */
function minutesLater(opened: Harness, minutes: number): void {
  opened.clock.set(`2026-08-06T09:${String(minutes).padStart(2, "0")}:00.000Z`);
}

async function abandonedRows(pool: Pool): Promise<readonly AbandonedWork[]> {
  return (await pool.work.abandoned({ limit: 50 })).values;
}

describe("a destination that comes back", () => {
  it("delivers on a later attempt, with one record and the item still out of the queue", async () => {
    const opened = await pending();
    const { pool } = opened;

    minutesLater(opened, 1);
    expect(await opened.deliver()).toBe(1);
    minutesLater(opened, 2);
    expect(await opened.deliver()).toBe(1);

    opened.destination.answers(DELIVERED);
    minutesLater(opened, 4);
    expect(await opened.deliver()).toBe(1);

    const records = await pool.routing.recordsFor(opened.item);
    expect(records).toEqual([
      { ...opened.record, state: "delivered", pointer: DELIVERED.pointer },
    ]);
    expect(ids((await pool.views.queue(ALL)).values)).toEqual([]);
    expect(await abandonedRows(pool)).toEqual([]);
  });

  it("owes the mirror the write it did not owe while the delivery was pending", async () => {
    const opened = await pending();

    opened.destination.answers(DELIVERED);
    minutesLater(opened, 1);
    await opened.deliver();

    const mirrored = await opened.pool.mirror.recordFor(opened.item);
    expect(mirrored?.routing.map((each) => each.state)).toEqual(["delivered"]);
  });

  it("appends the entry saying where the item went once it lands", async () => {
    const opened = await pending();
    opened.destination.answers(DELIVERED);
    minutesLater(opened, 1);
    await opened.deliver();

    const logged = await opened.pool.actions.forItem(opened.item, {
      limit: 50,
      order: "oldest-first",
    });
    expect(logged.values.map((action) => action.kind)).toEqual([
      "captured",
      "delivery-failed",
      "routed",
    ]);
  });
});

describe("a destination that never comes back", () => {
  it("is given up on at the limit, and the item comes back to the queue", async () => {
    const opened = await pending();
    const { pool } = opened;

    // `maxAttempts` is five, and the inline attempt is not one of the job's.
    for (let minute = 1; minute <= 6; minute += 1) {
      minutesLater(opened, minute);
      await opened.deliver();
    }

    expect(await pool.routing.recordsFor(opened.item)).toEqual([]);
    expect(ids((await pool.views.queue(ALL)).values)).toEqual([opened.item]);
    expect(await abandonedRows(pool)).toEqual([
      {
        subject: { kind: "routing-record", record: opened.record.id },
        item: opened.item,
        kind: "delivery",
        attempts: 5,
        lastFailure: { code: "unreachable", detail: "ECONNREFUSED" },
        abandonedAt: at("2026-08-06T09:05:00.000Z"),
      },
    ]);
  });

  it("records the abandonment against the item, which is what a person reads", async () => {
    const opened = await pending();
    for (let minute = 1; minute <= 6; minute += 1) {
      minutesLater(opened, minute);
      await opened.deliver();
    }

    const logged = await opened.pool.actions.forItem(opened.item, {
      limit: 50,
      order: "newest-first",
    });
    expect(logged.values[0]).toMatchObject({
      kind: "work-abandoned",
      by: { kind: "notemap" },
      detail: { work: "delivery", record: opened.record.id },
    });
  });

  it("leaves the item unmirrored as routed, so a rebuild finds it unprocessed", async () => {
    const opened = await pending();
    for (let minute = 1; minute <= 6; minute += 1) {
      minutesLater(opened, minute);
      await opened.deliver();
    }

    expect((await opened.pool.mirror.recordFor(opened.item))?.routing).toEqual(
      [],
    );
  });
});

/**
 * The property this whole plan exists for. A host that died mid-delivery
 * reported nothing, and the bytes may or may not have landed — so nothing is
 * tried again, because a duplicate in somebody's vault is undetectable and a
 * manual check is not.
 */
describe("a delivery whose host died holding it", () => {
  async function leaseExpired() {
    const opened = await pending();

    const [lease] = await opened.pool.work.claim({
      kinds: ["delivery"],
      limit: 1,
      leaseFor: MINUTE,
    });
    if (lease === undefined) throw new Error("expected a lease");

    // The host never reports and never releases: the lease simply runs out.
    minutesLater(opened, 2);
    return opened;
  }

  it("is abandoned on the next claim rather than retried", async () => {
    const opened = await leaseExpired();

    const claimed = await opened.pool.work.claim({
      kinds: ["delivery"],
      limit: 10,
      leaseFor: MINUTE,
    });

    expect(claimed).toEqual([]);
    expect(await opened.pool.routing.recordsFor(opened.item)).toEqual([]);
    expect(ids((await opened.pool.views.queue(ALL)).values)).toEqual([
      opened.item,
    ]);
  });

  it("hands the destination nothing a second time", async () => {
    const opened = await leaseExpired();
    const handed = opened.destination.received.length;

    await opened.deliver();

    expect(opened.destination.received).toHaveLength(handed);
  });

  it("is distinguishable on the abandoned surface from a refusal", async () => {
    const opened = await leaseExpired();
    await opened.pool.work.claim({
      kinds: ["delivery"],
      limit: 10,
      leaseFor: MINUTE,
    });

    const [row] = await abandonedRows(opened.pool);
    expect(row).toMatchObject({
      kind: "delivery",
      item: opened.item,
      lastFailure: {
        code: "delivery-outcome-unknown",
        detail: "a lease expired with no outcome reported",
      },
    });
  });
});

describe("two deliveries of one item", () => {
  it("are two jobs, and one abandoned leaves the other alone", async () => {
    const opened = await pending();
    const second = await opened.pool.routing.route(opened.item, {
      ...REQUEST,
      target: { path: "inbox/again.md" },
    });
    if (second.kind === "refused") throw new Error("expected a reservation");

    opened.destination.answersOnce(DELIVERED);
    minutesLater(opened, 1);
    await opened.deliver();

    const states = (await opened.pool.routing.recordsFor(opened.item)).map(
      (record: RoutingRecord) => record.state,
    );
    expect(states).toEqual(["delivered", "pending"]);
    expect(ids((await opened.pool.views.queue(ALL)).values)).toEqual([]);
  });
});

/**
 * The mirror as a person who has lost notemap would find it. A pending delivery
 * is a reservation rather than durable state, so a rebuild from these files
 * restores the item unprocessed and returns it to the queue — the promise
 * nothing is left to keep is never restored.
 */
describe("what reaches the mirror on disk", () => {
  it("carries the delivery once it lands, and not before", async () => {
    const opened = await pending();
    const drain = drainWith(opened);
    await drain();

    expect(
      (await storedRecords(opened.mirrorRoot)).get(opened.item)?.routing,
    ).toEqual([]);

    opened.destination.answers(DELIVERED);
    minutesLater(opened, 1);
    await opened.deliver();
    await drain();

    const mirrored = (await storedRecords(opened.mirrorRoot)).get(opened.item);
    expect(mirrored?.routing).toEqual([
      { ...opened.record, state: "delivered", pointer: DELIVERED.pointer },
    ]);
    expect(mirrored).toEqual(await opened.pool.mirror.recordFor(opened.item));
  });

  it("holds no record of a delivery that was given up on", async () => {
    const opened = await pending();
    const drain = drainWith(opened);
    await drain();

    for (let minute = 1; minute <= 6; minute += 1) {
      minutesLater(opened, minute);
      await opened.deliver();
    }
    await drain();

    expect(
      (await storedRecords(opened.mirrorRoot)).get(opened.item)?.routing,
    ).toEqual([]);
    expect(ids((await opened.pool.views.queue(ALL)).values)).toEqual([
      opened.item,
    ]);
    expect((await abandonedRows(opened.pool))[0]).toMatchObject({
      item: opened.item,
      kind: "delivery",
    });
  });
});

/** Nothing about a delivery may reach an item the pool does not hold. */
describe("routing an item that is not there", () => {
  it("refuses rather than minting a reservation", async () => {
    const opened = await pending();

    expect(
      await opened.pool.routing.route("nobody" as ItemId, REQUEST),
    ).toMatchObject({ refusal: { kind: "no-such-item" } });
  });
});
