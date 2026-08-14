import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Asset } from "../types/domain/asset";
import type { ItemId, Timestamp } from "../types/domain/ids";
import type { Item } from "../types/domain/item";
import type { RoutingRecord } from "../types/domain/routing";

import { poolState, type PoolState } from "./arbitraries";
import { parseMirrorRecord, serialiseMirrorRecord } from "./codec";
import { projectMirrorRecord } from "./record";

const project = (state: PoolState) =>
  projectMirrorRecord(state.item, state.assets, state.artifacts, state.routing);

const at = (value: string): Timestamp => value as Timestamp;

function anItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1" as ItemId,
    source: "scratchpad" as Item["source"],
    sourceItemId: "src-1",
    payload: {
      type: "text" as Item["payload"]["type"],
      content: { text: "a thought" },
      metadata: {},
      assets: [],
    },
    tags: [],
    createdAt: at("2026-08-11T09:00:00.000Z"),
    modifiedAt: at("2026-08-11T09:00:00.000Z"),
    ...overrides,
  };
}

const bare = (item: Item) => projectMirrorRecord(item, [], [], []);

/**
 * The one property the lossless claim rests on. A record that quietly drops a
 * field loses it forever, and nothing notices until a rebuild that may be years
 * away — so it is proved over generated pools rather than over examples someone
 * remembered to write.
 */
describe("the record round trips", () => {
  it("survives serialisation and parse unchanged", () => {
    fc.assert(
      fc.property(poolState(), (state) => {
        const record = project(state);
        expect(parseMirrorRecord(serialiseMirrorRecord(record))).toEqual(
          record,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("survives it a second time, byte for byte", () => {
    fc.assert(
      fc.property(poolState(), (state) => {
        const once = serialiseMirrorRecord(project(state));
        expect(serialiseMirrorRecord(parseMirrorRecord(once))).toBe(once);
      }),
      { numRuns: 500 },
    );
  });
});

describe("canonical serialisation", () => {
  it("gives one instant one spelling", () => {
    const loose = bare(
      anItem({
        createdAt: at("2026-08-11T09:00:00Z"),
        modifiedAt: at("2026-08-11T11:00:00+02:00"),
      }),
    );
    const exact = bare(
      anItem({
        createdAt: at("2026-08-11T09:00:00.000Z"),
        modifiedAt: at("2026-08-11T09:00:00.000Z"),
      }),
    );

    expect(serialiseMirrorRecord(loose)).toBe(serialiseMirrorRecord(exact));
  });

  it("gives one state one key order, whatever order it was built in", () => {
    const first = bare(
      anItem({
        payload: {
          type: "text" as Item["payload"]["type"],
          content: { b: 1, a: 2 },
          metadata: {},
          assets: [],
        },
      }),
    );
    const second = bare(
      anItem({
        payload: {
          type: "text" as Item["payload"]["type"],
          content: { a: 2, b: 1 },
          metadata: {},
          assets: [],
        },
      }),
    );

    expect(serialiseMirrorRecord(first)).toBe(serialiseMirrorRecord(second));
  });

  it("gives one set of assets one order", () => {
    const assets: Asset[] = [
      {
        id: "asset-b" as Asset["id"],
        filename: "b.wav",
        mime: "audio/wav",
        blob: "hash-b" as Asset["blob"],
        bytes: 2,
      },
      {
        id: "asset-a" as Asset["id"],
        filename: "a.wav",
        mime: "audio/wav",
        blob: "hash-a" as Asset["blob"],
        bytes: 1,
      },
    ];

    const forwards = projectMirrorRecord(anItem(), assets, [], []);
    const backwards = projectMirrorRecord(
      anItem(),
      [...assets].reverse(),
      [],
      [],
    );

    expect(serialiseMirrorRecord(forwards)).toBe(
      serialiseMirrorRecord(backwards),
    );
    expect(forwards.assets.map((asset) => asset.id)).toEqual([
      "asset-a",
      "asset-b",
    ]);
  });
});

describe("what the record leaves out", () => {
  it("carries no derived state", () => {
    const record = bare(
      anItem({
        supersededBy: "item-2" as ItemId,
        revisionOf: "item-0" as ItemId,
      }),
    );

    expect(serialiseMirrorRecord(record)).not.toContain("supersededBy");
    // The revision link itself is material and stays.
    expect(record.item.revisionOf).toBe("item-0");
  });

  /** A rebuild that restored one would restore a promise no job exists to keep. */
  it("carries a delivered routing record and leaves a pending one out", () => {
    const delivered: RoutingRecord = {
      id: "routing-1" as RoutingRecord["id"],
      item: "item-1" as ItemId,
      target: { kind: "user" },
      state: "delivered",
      at: at("2026-08-11T09:00:00.000Z"),
    };
    const pending: RoutingRecord = {
      ...delivered,
      id: "routing-2" as RoutingRecord["id"],
      state: "pending",
    };

    const record = projectMirrorRecord(anItem(), [], [], [delivered, pending]);

    expect(record.routing).toEqual([delivered]);
  });

  it("carries modifiedAt, which verify compares and rebuild ignores", () => {
    const record = bare(anItem({ modifiedAt: at("2026-08-11T10:00:00.000Z") }));

    expect(record.modifiedAt).toBe("2026-08-11T10:00:00.000Z");
    expect("modifiedAt" in record.item).toBe(false);
  });
});

describe("parsing", () => {
  it("refuses a file that is not JSON", () => {
    expect(() => parseMirrorRecord("{ truncated")).toThrow(
      /not a mirror record/,
    );
  });

  it("refuses a record missing a field a rebuild needs", () => {
    const record = JSON.parse(serialiseMirrorRecord(bare(anItem()))) as Record<
      string,
      unknown
    >;
    delete (record["item"] as Record<string, unknown>)["createdAt"];

    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /item\.createdAt is not a string/,
    );
  });

  it("refuses a record whose agent is not one", () => {
    const record = JSON.parse(
      serialiseMirrorRecord(
        bare(
          anItem({
            tags: [
              {
                name: "kind/quote" as Item["tags"][number]["name"],
                by: { kind: "person" },
                addedAt: at("2026-08-11T09:00:00.000Z"),
              },
            ],
          }),
        ),
      ),
    ) as { item: { tags: { by: { kind: string } }[] } };
    const tag = record.item.tags[0];
    if (tag === undefined) throw new Error("expected a tag");
    tag.by.kind = "the cat";

    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /is not an agent/,
    );
  });
});
