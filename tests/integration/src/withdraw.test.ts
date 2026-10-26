import type {
  Action,
  CapabilityName,
  DestinationId,
  EditEnvelope,
  ItemId,
  Page,
  Pool,
  RoutingRecord,
  RoutingRecordId,
  TagName,
} from "@notemap/core";
import { fakeCapability, fakeDestinations } from "@notemap/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  deliverWith,
  drainWith,
  envelope,
  harness,
  itemRecord,
  SCRATCHPAD,
  TEXT,
  type Harness,
} from "./fixture";

const VAULT = "vault" as DestinationId;
const CREATE_NOTE = "create-note" as CapabilityName;
const PERSON = { kind: "person" } as const;
const ALL: Page = { limit: 50 };
const RESEARCH = "route/research" as TagName;
const SHELL = "shell/web" as typeof SCRATCHPAD;

const CAPTURED_AT = "2026-08-06T09:00:00.000Z";
const WITHDRAWN_AT = "2026-08-06T10:00:00.000Z";
const LATER = "2026-08-06T11:00:00.000Z";
const AFTER_WINDOW = "2026-08-06T09:00:20.000Z";

const PATH_SCHEMA = {
  type: "object",
  required: ["path"],
  properties: { path: { type: "string" } },
  additionalProperties: false,
};

const DELIVERED = { kind: "delivered", pointer: "inbox/a-thought.md" } as const;

const open: Harness[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

async function pooled(mirroring: Parameters<typeof harness>[1] = "stub") {
  const destination = fakeDestinations({
    capabilities: [
      fakeCapability({ name: "create-note", argumentsSchema: PATH_SCHEMA }),
    ],
  });
  const opened = harness(undefined, mirroring, destination);
  open.push(opened);
  await opened.putDestination({ id: VAULT });
  destination.answers(DELIVERED);
  return { ...opened, destination, deliver: deliverWith(opened, destination) };
}

function succeeded<T>(
  result: { kind: "ok"; value: T } | { kind: "refused"; refusal: unknown },
): T {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value;
}

const request = (path = "inbox/a-thought.md") => ({
  destination: VAULT,
  capability: CREATE_NOTE,
  arguments: { path },
});

async function capture(pool: Pool, id = "item-1"): Promise<ItemId> {
  return succeeded(await pool.capture(envelope({ id }))).item.id;
}

async function routed(mirroring: Parameters<typeof harness>[1] = "stub") {
  const opened = await pooled(mirroring);
  const item = await capture(opened.pool);
  const record = succeeded(await opened.pool.routing.route(item, request()));
  opened.clock.set(WITHDRAWN_AT);
  return { ...opened, item, record };
}

const edit = (value: string): EditEnvelope => ({
  source: SHELL,
  sourceItemId: "edit-1",
  payload: { type: TEXT, content: { text: value }, metadata: {}, assets: [] },
});

const queued = async (pool: Pool): Promise<readonly ItemId[]> =>
  (await pool.views.queue(ALL)).values.map((each) => each.id);

const tagsOn = async (pool: Pool, item: ItemId): Promise<readonly string[]> =>
  ((await pool.items.get(item))?.tags ?? []).map((held) => held.name);

const logFor = async (pool: Pool, item: ItemId): Promise<readonly Action[]> =>
  (await pool.actions.read({ item }, { ...ALL, order: "newest-first" })).values;

describe("withdrawing a delivered record", () => {
  it("keeps the record, marked, and returns the item to the queue", async () => {
    const { pool, item, record } = await routed();

    const withdrawn = succeeded(await pool.routing.withdraw(record.id));

    expect(withdrawn).toEqual({ ...record, withdrawnAt: WITHDRAWN_AT });
    expect(await pool.routing.recordsFor(item)).toEqual([withdrawn]);
    expect(await queued(pool)).toEqual([item]);
  });

  it("reads as unrouted on the item, and moves processed-at back", async () => {
    const { pool, item, record } = await routed();
    expect((await pool.items.get(item))?.processedAt).toBe(record.at);

    succeeded(await pool.routing.withdraw(record.id));

    const after = await pool.items.get(item);
    expect(after?.routing).toBeUndefined();
    expect(after?.processedAt).toBe(CAPTURED_AT);
  });

  it("leaves the record out of the routed state and the destination filter", async () => {
    const { pool, item, record } = await routed();
    succeeded(await pool.routing.withdraw(record.id));

    const feed = (filter: Parameters<Pool["views"]["feed"]>[1]) =>
      pool.views
        .feed(ALL, filter)
        .then((slice) => slice.values.map((each) => each.id));

    expect(await feed({ states: ["routed"] })).toEqual([]);
    expect(await feed({ states: ["unprocessed"] })).toEqual([item]);
    expect(await feed({ destinations: [VAULT] })).toEqual([]);
  });

  it("stops counting it as a place the destination has been used", async () => {
    const { pool, record } = await routed();
    const field = { capability: CREATE_NOTE, field: "path" };
    expect(
      (await pool.destinations.remembered(VAULT, field))?.places,
    ).toHaveLength(1);

    succeeded(await pool.routing.withdraw(record.id));

    expect((await pool.destinations.remembered(VAULT, field))?.places).toEqual(
      [],
    );
  });

  it("unseals the item, so an edit amends it in place", async () => {
    const { pool, item, record } = await routed();
    succeeded(await pool.routing.withdraw(record.id));

    const outcome = succeeded(
      await pool.items.edit(item, edit("a second thought"), PERSON),
    );

    expect(outcome.kind).toBe("amended");
  });

  it("leaves the item sealed while another delivered record stands", async () => {
    const { pool, item, record } = await routed();
    succeeded(await pool.routing.route(item, request("inbox/again.md")));
    succeeded(await pool.routing.withdraw(record.id));

    const outcome = succeeded(
      await pool.items.edit(item, edit("a second thought"), PERSON),
    );

    expect(outcome.kind).toBe("revised");
    expect(await queued(pool)).not.toContain(item);
  });

  it("records the withdrawal in the log, naming where it had gone", async () => {
    const { pool, item, record } = await routed();

    succeeded(await pool.routing.withdraw(record.id));

    expect((await logFor(pool, item))[0]).toMatchObject({
      kind: "delivery-withdrawn",
      by: PERSON,
      at: WITHDRAWN_AT,
      detail: {
        record: record.id,
        destination: VAULT,
        capability: CREATE_NOTE,
      },
    });
  });

  it("owes the mirror the item, carrying the withdrawal", async () => {
    const opened = await routed("filesystem");
    const { pool, item, record } = opened;
    await drainWith(opened)();

    succeeded(await pool.routing.withdraw(record.id));

    expect(await drainWith(opened)()).toBe(1);
    expect((await itemRecord(pool, item))?.routing).toMatchObject([
      { id: record.id, withdrawnAt: WITHDRAWN_AT },
    ]);
  });

  it("refuses a record already withdrawn", async () => {
    const { pool, record } = await routed();
    succeeded(await pool.routing.withdraw(record.id));

    expect(await pool.routing.withdraw(record.id)).toMatchObject({
      refusal: { kind: "already-withdrawn", record: record.id },
    });
  });

  it("refuses a pending delivery, which is cancelled instead", async () => {
    const { pool, destination } = await pooled();
    destination.answers({ kind: "unreachable", detail: "ECONNREFUSED" });
    const item = await capture(pool);
    const record = succeeded(await pool.routing.route(item, request()));

    expect(await pool.routing.withdraw(record.id)).toMatchObject({
      refusal: { kind: "not-delivered", record: record.id },
    });
  });

  it("refuses a mark made by hand, which is cancelled instead", async () => {
    const { pool } = await pooled();
    const item = await capture(pool);
    const record = succeeded(await pool.routing.markProcessed(item));

    expect(await pool.routing.withdraw(record.id)).toMatchObject({
      refusal: { kind: "marked-by-hand", record: record.id },
    });
  });

  it("refuses a record no decision minted", async () => {
    const { pool } = await pooled();

    expect(
      await pool.routing.withdraw("nobody" as RoutingRecordId),
    ).toMatchObject({ refusal: { kind: "no-such-record", record: "nobody" } });
  });
});

describe("restoring a withdrawn record", () => {
  it("puts the record back, and takes the item out of the queue", async () => {
    const { pool, item, record, clock } = await routed();
    succeeded(await pool.routing.withdraw(record.id));
    clock.set(LATER);

    expect(succeeded(await pool.routing.restore(record.id))).toEqual(record);
    expect(await pool.routing.recordsFor(item)).toEqual([record]);
    expect(await queued(pool)).toEqual([]);
    expect((await pool.items.get(item))?.processedAt).toBe(record.at);
    expect((await logFor(pool, item))[0]).toMatchObject({
      kind: "delivery-restored",
      at: LATER,
      detail: { record: record.id },
    });
  });

  it("refuses once the item has been edited since, since the record would name words it no longer holds", async () => {
    const { pool, item, record, clock } = await routed();
    succeeded(await pool.routing.withdraw(record.id));
    clock.set(LATER);
    succeeded(await pool.items.edit(item, edit("a second thought"), PERSON));

    expect(await pool.routing.restore(record.id)).toMatchObject({
      refusal: { kind: "edited-since-withdrawal", record: record.id },
    });
  });

  it("refuses a record that stands", async () => {
    const { pool, record } = await routed();

    expect(await pool.routing.restore(record.id)).toMatchObject({
      refusal: { kind: "not-withdrawn", record: record.id },
    });
  });
});

describe("withdrawing a record a trigger tag made", () => {
  async function fired() {
    const opened = await pooled();
    const template = succeeded(
      await opened.pool.templates.create({
        name: "Research links",
        destination: VAULT,
        capability: CREATE_NOTE,
        arguments: { path: "research/{{captured_at}}.md" },
        triggerTag: RESEARCH,
      }),
    );
    const item = await capture(opened.pool);
    succeeded(await opened.pool.items.tag(item, RESEARCH, PERSON));
    opened.clock.set(AFTER_WINDOW);
    await opened.deliver();
    const [record] = await opened.pool.routing.recordsFor(item);
    if (record?.state !== "delivered") throw new Error("expected a delivery");
    opened.clock.set(WITHDRAWN_AT);
    return { ...opened, template, item, record };
  }

  it("takes the tag off, so applying it again routes again", async () => {
    const { pool, item, record, deliver, clock } = await fired();

    succeeded(await pool.routing.withdraw(record.id));
    expect(await tagsOn(pool, item)).toEqual([]);
    expect((await logFor(pool, item))[0]).toMatchObject({
      kind: "delivery-withdrawn",
      detail: { tag: RESEARCH },
    });

    succeeded(await pool.items.tag(item, RESEARCH, PERSON));
    clock.set(LATER);
    await deliver();

    const records = await pool.routing.recordsFor(item);
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({ state: "delivered" });
    expect(await queued(pool)).toEqual([]);
  });

  it("puts the tag back on restore without firing the template", async () => {
    const { pool, item, record, deliver, clock } = await fired();
    succeeded(await pool.routing.withdraw(record.id));

    succeeded(await pool.routing.restore(record.id));
    clock.set(LATER);
    await deliver();

    expect(await tagsOn(pool, item)).toEqual([RESEARCH]);
    expect(await pool.routing.recordsFor(item)).toEqual<RoutingRecord[]>([
      record,
    ]);
  });

  it("leaves the tag alone on restore where the item already holds it again", async () => {
    const { pool, item, record } = await fired();
    succeeded(await pool.routing.withdraw(record.id));
    succeeded(await pool.items.tag(item, RESEARCH, PERSON));

    succeeded(await pool.routing.restore(record.id));

    expect(
      (await logFor(pool, item)).filter(
        (one) => one.kind === "tagged" && one.detail["record"] === record.id,
      ),
    ).toEqual([]);
  });

  it("stops counting it against the template's report", async () => {
    const { pool, template, record } = await fired();
    expect((await pool.templates.get(template.id))?.fired?.records).toBe(1);

    succeeded(await pool.routing.withdraw(record.id));

    expect((await pool.templates.get(template.id))?.fired?.records).toBe(0);
  });
});

describe("asking whether a delivery is still there", () => {
  it("hands the destination where the record says it went", async () => {
    const { pool, record, destination } = await routed();
    destination.answersPresence({ kind: "present", found: 1, of: 1 });

    expect(succeeded(await pool.routing.locate(record.id))).toEqual({
      kind: "present",
      found: 1,
      of: 1,
    });
    expect(destination.located).toEqual([
      {
        capability: CREATE_NOTE,
        arguments: { path: "inbox/a-thought.md" },
        pointer: "inbox/a-thought.md",
      },
    ]);
  });

  it("cannot tell where the kind does not look", async () => {
    const { pool, record } = await routed();

    expect(succeeded(await pool.routing.locate(record.id))).toEqual({
      kind: "unknown",
    });
  });

  it("cannot tell where the destination could not be reached, and says why", async () => {
    const { pool, record, destination } = await routed();
    destination.cannotLocate("ECONNREFUSED");

    expect(succeeded(await pool.routing.locate(record.id))).toEqual({
      kind: "unknown",
      detail: "ECONNREFUSED",
    });
  });

  it("refuses a mark made by hand, which went nowhere to look", async () => {
    const { pool } = await pooled();
    const item = await capture(pool);
    const record = succeeded(await pool.routing.markProcessed(item));

    expect(await pool.routing.locate(record.id)).toMatchObject({
      refusal: { kind: "marked-by-hand", record: record.id },
    });
  });

  it("refuses a pending delivery, which has not gone anywhere yet", async () => {
    const { pool, destination } = await pooled();
    destination.answers({ kind: "unreachable", detail: "ECONNREFUSED" });
    const item = await capture(pool);
    const record = succeeded(await pool.routing.route(item, request()));

    expect(await pool.routing.locate(record.id)).toMatchObject({
      refusal: { kind: "not-delivered", record: record.id },
    });
  });
});
