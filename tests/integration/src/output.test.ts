import type {
  CapabilityName,
  DeliveryOutcome,
  DestinationId,
  Item,
  ItemId,
  Pool,
  RoutingRecordId,
} from "@notemap/core";
import { fakeCapability, fakeDestinations } from "@notemap/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import {
  bytes,
  collect,
  deliverWith,
  drainWith,
  envelope,
  filesUnder,
  harness,
  itemRecord,
  storedRecord,
  streamOf,
  type Harness,
} from "./fixture";

const VAULT = "vault" as DestinationId;

const PATH_SCHEMA = {
  type: "object",
  required: ["path"],
  properties: { path: { type: "string" } },
  additionalProperties: false,
};

const CAPABILITIES = [
  fakeCapability({ name: "create-note", argumentsSchema: PATH_SCHEMA }),
];

const open: Harness[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

async function pooled(mirroring: Parameters<typeof harness>[1] = "stub") {
  const destination = fakeDestinations({ capabilities: CAPABILITIES });
  const opened = harness(undefined, mirroring, destination);
  open.push(opened);
  await opened.putDestination({ id: VAULT });
  return { ...opened, destination };
}

function request(path = "inbox/a-thought.md") {
  return {
    destination: VAULT,
    capability: "create-note" as CapabilityName,
    arguments: { path },
  };
}

/** Everything a kind that converts answers with: where it landed, and what it wrote. */
function delivered(
  markdown: string,
  note?: string,
): DeliveryOutcome & { kind: "delivered" } {
  return {
    kind: "delivered",
    pointer: "vault/inbox/a-thought.md",
    url: "https://vault.example/inbox/a-thought.md",
    output: {
      content: {
        mediaType: "text/markdown",
        open: () => Promise.resolve(streamOf(bytes(markdown))),
      },
      ...(note === undefined ? {} : { note }),
    },
  };
}

async function capture(pool: Pool, id = "item-1"): Promise<ItemId> {
  const result = await pool.capture(envelope({ id }));
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return (result.value.item as Item).id;
}

function routed<T>(
  result: { kind: "ok"; value: T } | { kind: "refused"; refusal: unknown },
): T {
  if (result.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.value;
}

async function read(pool: Pool, record: RoutingRecordId): Promise<string> {
  const opened = await pool.routing.openOutput(record);
  if (opened.kind === "refused") {
    throw new Error(`refused: ${JSON.stringify(opened.refusal)}`);
  }
  return new TextDecoder().decode(await collect(opened.value.bytes));
}

describe("what a delivery says it produced", () => {
  it("stores the content as a blob the record names, with the note and the url", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answers(
      delivered("# a thought\n", "the two pictures were not carried"),
    );
    const item = await capture(pool);

    const record = routed(await pool.routing.route(item, request()));

    expect(record).toMatchObject({
      state: "delivered",
      pointer: "vault/inbox/a-thought.md",
      url: "https://vault.example/inbox/a-thought.md",
      output: {
        content: { mediaType: "text/markdown" },
        note: "the two pictures were not carried",
      },
    });
    expect(record.output?.content?.blob).toMatch(/./);
    expect(await read(pool, record.id)).toBe("# a thought\n");
  });

  it("costs one blob when the same output is routed twice", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answers(delivered("# a thought\n"));

    const first = routed(
      await pool.routing.route(await capture(pool, "item-1"), request()),
    );
    const second = routed(
      await pool.routing.route(await capture(pool, "item-2"), request("b.md")),
    );

    expect(second.output?.content?.blob).toBe(first.output?.content?.blob);
    expect(await filesUnder(opened.assetRoot)).toHaveLength(1);
  });

  it("keeps a note about what was left behind with no content at all", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answers({
      kind: "delivered",
      pointer: "posted",
      output: { note: "the API kept no copy" },
    });
    const item = await capture(pool);

    const record = routed(await pool.routing.route(item, request()));

    expect(record.output).toEqual({ note: "the API kept no copy" });
    expect(await filesUnder(opened.assetRoot)).toEqual([]);
    expect(await pool.routing.openOutput(record.id)).toEqual({
      kind: "refused",
      refusal: { kind: "no-output", record: record.id },
    });
  });

  it("records nothing where the destination answered no output", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answers({ kind: "delivered", pointer: "vault/a.md" });
    const item = await capture(pool);

    const record = routed(await pool.routing.route(item, request()));

    expect(record.output).toBeUndefined();
    expect(record.url).toBeUndefined();
    expect(await filesUnder(opened.assetRoot)).toEqual([]);
  });

  it("refuses an output nobody has a record for", async () => {
    const { pool } = await pooled();

    expect(await pool.routing.openOutput("ghost" as RoutingRecordId)).toEqual({
      kind: "refused",
      refusal: { kind: "no-such-record", record: "ghost" },
    });
  });
});

describe("a deferred delivery that lands", () => {
  it("records what it produced when the job carries it out", async () => {
    const opened = await pooled();
    const { pool } = opened;
    opened.destination.answers({ kind: "unreachable", detail: "asleep" });
    const item = await capture(pool);
    const reservation = routed(await pool.routing.route(item, request()));

    opened.destination.answers(delivered("# later\n", "no pictures"));
    expect(await deliverWith(opened, opened.destination)()).toBe(1);

    const [record] = await pool.routing.recordsFor(item);
    expect(record).toMatchObject({
      id: reservation.id,
      state: "delivered",
      url: "https://vault.example/inbox/a-thought.md",
      output: {
        content: { mediaType: "text/markdown" },
        note: "no pictures",
      },
    });
    expect(await read(pool, reservation.id)).toBe("# later\n");
  });
});

describe("the mirror and the output", () => {
  it("carries the hash, the media type, the note and the url on the record", async () => {
    const opened = await pooled("filesystem");
    const { pool } = opened;
    opened.destination.answers(delivered("# a thought\n", "no pictures"));
    const item = await capture(pool);
    await drainWith(opened)();

    const record = routed(await pool.routing.route(item, request()));
    await drainWith(opened)();

    const mirrored = await storedRecord(opened.mirrorRoot);
    expect(mirrored.routing).toEqual([record]);
    // The bytes themselves are where an asset's are: one content-addressed
    // store, shared, which the mirror names rather than copies.
    expect((await itemRecord(pool, item))?.routing).toEqual([record]);
  });
});

describe("the sweep and the output", () => {
  it("leaves an output's blob alone", async () => {
    const opened = await pooled();
    const { pool, clock } = opened;
    opened.destination.answers(delivered("# a thought\n"));
    const item = await capture(pool);
    routed(await pool.routing.route(item, request()));

    clock.set("2026-08-08T09:00:00.000Z");
    expect(await pool.maintenance.sweepUnreferencedAssets()).toEqual([]);
    expect(await filesUnder(opened.assetRoot)).toHaveLength(1);
  });
});
