import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Artifact } from "#types/domain/enrichment";
import type { Asset } from "#types/domain/asset";
import type { Destination } from "#types/domain/destination";
import type {
  CapabilityName,
  DestinationId,
  DestinationKindName,
  ItemId,
  PoolSettingName,
  RoutingTemplateId,
  Timestamp,
} from "#types/domain/ids";
import type { Item } from "#types/domain/item";
import type { PoolSettingRecord } from "#types/domain/pool-setting";
import type { RoutingRecord } from "#types/domain/routing";
import type { RoutingTemplate } from "#types/domain/template";

import {
  destination,
  poolSettingRecord,
  poolState,
  routingTemplate,
  type PoolState,
} from "./arbitraries";
import { parseMirrorRecord, serialiseMirrorRecord } from "./codec";
import {
  projectDestinationRecord,
  projectMirrorRecord,
  projectPoolSettingRecord,
  projectTemplateRecord,
} from "./record";

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
    processedAt: at("2026-08-11T09:00:00.000Z"),
    revisedInto: [],
    ...overrides,
  };
}

const bare = (item: Item) => projectMirrorRecord(item, [], [], []);

function aTemplate(overrides: Partial<RoutingTemplate> = {}): RoutingTemplate {
  return {
    id: "template-1" as RoutingTemplateId,
    name: "quotes to vault",
    destination: "vault" as DestinationId,
    capability: "create-note" as CapabilityName,
    arguments: {},
    folder: "create",
    createdAt: at("2026-08-11T09:00:00.000Z"),
    modifiedAt: at("2026-08-11T09:00:00.000Z"),
    fired: { records: 0 },
    ...overrides,
  };
}

function aDestination(overrides: Partial<Destination> = {}): Destination {
  return {
    id: "vault" as DestinationId,
    name: "Vault",
    kind: "filesystem" as DestinationKindName,
    settings: {},
    createdAt: at("2026-08-11T09:00:00.000Z"),
    modifiedAt: at("2026-08-11T09:00:00.000Z"),
    ...overrides,
  };
}

function aPoolSetting(
  overrides: Partial<PoolSettingRecord> = {},
): PoolSettingRecord {
  return {
    name: "capture.autoTag" as PoolSettingName,
    value: true,
    changedAt: at("2026-08-11T09:00:00.000Z"),
    ...overrides,
  };
}

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

  /**
   * The mirror's other unit joins the same property rather than getting a
   * parallel one: what the claim rests on is that no record loses a field, and
   * a destination is a record.
   */
  it("carries a destination whole, retirement and all", () => {
    fc.assert(
      fc.property(destination(), (held) => {
        const record = projectDestinationRecord(held);
        expect(parseMirrorRecord(serialiseMirrorRecord(record))).toEqual(
          record,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("keeps a destination byte for byte a second time round", () => {
    fc.assert(
      fc.property(destination(), (held) => {
        const once = serialiseMirrorRecord(projectDestinationRecord(held));
        expect(serialiseMirrorRecord(parseMirrorRecord(once))).toBe(once);
      }),
      { numRuns: 500 },
    );
  });

  it("carries a template whole, its patterns and its establishment", () => {
    fc.assert(
      fc.property(routingTemplate(), (held) => {
        const record = projectTemplateRecord(held);
        expect(parseMirrorRecord(serialiseMirrorRecord(record))).toEqual(
          record,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("keeps a template byte for byte a second time round", () => {
    fc.assert(
      fc.property(routingTemplate(), (held) => {
        const once = serialiseMirrorRecord(projectTemplateRecord(held));
        expect(serialiseMirrorRecord(parseMirrorRecord(once))).toBe(once);
      }),
      { numRuns: 500 },
    );
  });

  it("carries a pool setting whole", () => {
    fc.assert(
      fc.property(poolSettingRecord(), (held) => {
        const record = projectPoolSettingRecord(held);
        expect(parseMirrorRecord(serialiseMirrorRecord(record))).toEqual(
          record,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("keeps a pool setting byte for byte a second time round", () => {
    fc.assert(
      fc.property(poolSettingRecord(), (held) => {
        const once = serialiseMirrorRecord(projectPoolSettingRecord(held));
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

  it("gives one set of artifacts one order, each carrying its own assets in slot order", () => {
    const artifact = (id: string): Artifact => ({
      id: id as Artifact["id"],
      item: "item-1" as ItemId,
      enrichment: "transcribe" as Artifact["enrichment"],
      by: { kind: "notemap" },
      createdAt: at("2026-08-11T09:00:00.000Z"),
      content: {},
      assets: [
        {
          slot: "cover",
          asset: "asset-b" as Artifact["assets"][number]["asset"],
        },
        {
          slot: "audio",
          asset: "asset-a" as Artifact["assets"][number]["asset"],
        },
      ],
    });
    const artifacts = [artifact("artifact-b"), artifact("artifact-a")];

    const forwards = projectMirrorRecord(anItem(), [], artifacts, []);
    const backwards = projectMirrorRecord(
      anItem(),
      [],
      [...artifacts].reverse(),
      [],
    );

    expect(serialiseMirrorRecord(forwards)).toBe(
      serialiseMirrorRecord(backwards),
    );
    expect(forwards.artifacts.map((each) => each.id)).toEqual([
      "artifact-a",
      "artifact-b",
    ]);
    expect(forwards.artifacts[0]?.assets.map((ref) => ref.slot)).toEqual([
      "audio",
      "cover",
    ]);
  });

  it("gives one set of delivered routing records one order", () => {
    const routing = (id: string): RoutingRecord => ({
      id: id as RoutingRecord["id"],
      item: "item-1" as ItemId,
      target: { kind: "user" },
      state: "delivered",
      at: at("2026-08-11T09:00:00.000Z"),
    });
    const records = [routing("routing-b"), routing("routing-a")];

    const forwards = projectMirrorRecord(anItem(), [], [], records);
    const backwards = projectMirrorRecord(
      anItem(),
      [],
      [],
      [...records].reverse(),
    );

    expect(serialiseMirrorRecord(forwards)).toBe(
      serialiseMirrorRecord(backwards),
    );
    expect(forwards.routing.map((each) => each.id)).toEqual([
      "routing-a",
      "routing-b",
    ]);
  });

  it("gives one set of tags one order", () => {
    const tag = (name: string): Item["tags"][number] => ({
      name: name as Item["tags"][number]["name"],
      by: { kind: "person" },
      addedAt: at("2026-08-11T09:00:00.000Z"),
    });
    const tags = [tag("kind/quote"), tag("kind/article")];

    const forwards = bare(anItem({ tags }));
    const backwards = bare(anItem({ tags: [...tags].reverse() }));

    expect(serialiseMirrorRecord(forwards)).toBe(
      serialiseMirrorRecord(backwards),
    );
    expect(forwards.item.tags.map((each) => each.name)).toEqual([
      "kind/article",
      "kind/quote",
    ]);
  });

  it("gives one payload's assets one order, by slot", () => {
    const ref = (
      slot: string,
      asset: string,
    ): Item["payload"]["assets"][number] => ({
      slot,
      asset: asset as Item["payload"]["assets"][number]["asset"],
    });
    const assets = [ref("cover", "asset-b"), ref("audio", "asset-a")];
    const payload = anItem().payload;

    const forwards = bare(anItem({ payload: { ...payload, assets } }));
    const backwards = bare(
      anItem({ payload: { ...payload, assets: [...assets].reverse() } }),
    );

    expect(serialiseMirrorRecord(forwards)).toBe(
      serialiseMirrorRecord(backwards),
    );
    expect(forwards.item.payload.assets.map((each) => each.slot)).toEqual([
      "audio",
      "cover",
    ]);
  });
});

describe("what the record keeps", () => {
  it("carries a UTC offset and a content revision time, when the item knows them", () => {
    const withBoth = bare(
      anItem({
        utcOffset: -120,
        contentUpdatedAt: at("2026-08-11T10:00:00.000Z"),
      }),
    );

    expect(withBoth.item.utcOffset).toBe(-120);
    expect(withBoth.item.contentUpdatedAt).toBe("2026-08-11T10:00:00.000Z");

    const withNeither = bare(anItem());
    expect("utcOffset" in withNeither.item).toBe(false);
    expect("contentUpdatedAt" in withNeither.item).toBe(false);
  });

  it("leaves a revision link out where the item carries none", () => {
    const unrevised = bare(anItem());
    expect("revisionOf" in unrevised.item).toBe(false);
  });

  it("carries an item's archive state, with its instant canonicalised", () => {
    const archived = bare(
      anItem({
        archived: {
          archivedAt: at("2026-08-11T09:00:00Z"),
          reason: "superseded",
        },
      }),
    );

    expect(archived.item.archived).toEqual({
      archivedAt: "2026-08-11T09:00:00.000Z",
      reason: "superseded",
    });
  });

  it("carries a destination's retirement, when it has one", () => {
    const retired = projectDestinationRecord(
      aDestination({ retiredAt: at("2026-08-11T09:00:00Z") }),
    );
    expect(retired.destination.retiredAt).toBe("2026-08-11T09:00:00.000Z");

    const active = projectDestinationRecord(aDestination());
    expect("retiredAt" in active.destination).toBe(false);
  });

  it("carries a template's establishment, when it has one", () => {
    const established = projectTemplateRecord(
      aTemplate({ establishedAt: at("2026-08-11T09:00:00Z") }),
    );
    expect(established.template.establishedAt).toBe("2026-08-11T09:00:00.000Z");

    const unestablished = projectTemplateRecord(aTemplate());
    expect("establishedAt" in unestablished.template).toBe(false);
  });
});

describe("a timestamp the projector is handed", () => {
  it("refuses one it cannot parse, rather than writing it through", () => {
    expect(() =>
      bare(anItem({ createdAt: "not a date" as Timestamp })),
    ).toThrow(/not a parseable timestamp/);
  });
});

describe("what the record leaves out", () => {
  it("carries no derived state", () => {
    const record = bare(
      anItem({
        revisedInto: ["item-2" as ItemId],
        revisionOf: "item-0" as ItemId,
        routing: {
          records: 1,
          pending: 0,
          to: [{ kind: "user" }],
          templates: [],
        },
      }),
    );

    const written = serialiseMirrorRecord(record);
    expect(written).not.toContain("revisedInto");
    // The item's own summary of its records, which the records themselves say.
    expect(record.item).not.toHaveProperty("routing");
    expect(written).not.toContain("pending");
    // The revision link itself is material and stays.
    expect(record.item.revisionOf).toBe("item-0");
  });

  it("carries no picture's dimensions, which are read from its blob", () => {
    const measured: Asset = {
      id: "asset-a" as Asset["id"],
      filename: "a.png",
      mime: "image/png",
      blob: "hash-a" as Asset["blob"],
      bytes: 1,
      dimensions: { width: 640, height: 480 },
    };

    const record = projectMirrorRecord(anItem(), [measured], [], []);

    expect(serialiseMirrorRecord(record)).not.toContain("dimensions");
    expect(parseMirrorRecord(serialiseMirrorRecord(record))).toEqual(record);
  });

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

  /** The words a delivery was decided with are as much the record as the place it named. */
  it("carries the rewrite a record was decided with", () => {
    const rewritten: RoutingRecord = {
      id: "routing-1" as RoutingRecord["id"],
      item: "item-1" as ItemId,
      target: {
        kind: "destination",
        destination: "vault" as DestinationId,
        capability: "create-note" as CapabilityName,
        arguments: { path: "inbox/a.md" },
        content: { text: "a thought, tidied" },
      },
      state: "delivered",
      at: at("2026-08-11T09:00:00.000Z"),
    };

    const record = projectMirrorRecord(anItem(), [], [], [rewritten]);

    expect(record.routing).toEqual([rewritten]);
    expect(parseMirrorRecord(serialiseMirrorRecord(record))).toEqual(record);
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

  it("refuses a record that is not an object", () => {
    expect(() => parseMirrorRecord("42")).toThrow(
      /the record is not an object/,
    );
    expect(() => parseMirrorRecord("null")).toThrow(
      /the record is not an object/,
    );
    expect(() => parseMirrorRecord("[]")).toThrow(
      /the record is not an object/,
    );
  });

  it("refuses an item whose tags are not a list", () => {
    const record = JSON.parse(serialiseMirrorRecord(bare(anItem()))) as Record<
      string,
      unknown
    >;
    (record["item"] as Record<string, unknown>)["tags"] = "kind/quote";

    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /item\.tags is not a list/,
    );
  });

  it("refuses a timestamp that does not parse as one", () => {
    const record = JSON.parse(serialiseMirrorRecord(bare(anItem()))) as Record<
      string,
      unknown
    >;
    (record["item"] as Record<string, unknown>)["createdAt"] = "not a date";

    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /item\.createdAt is not a timestamp/,
    );
  });

  it("refuses a UTC offset that is not a whole number of minutes within a day", () => {
    const record = JSON.parse(
      serialiseMirrorRecord(bare(anItem({ utcOffset: 60 }))),
    ) as Record<string, unknown>;
    const item = record["item"] as Record<string, unknown>;

    item["utcOffset"] = "sixty";
    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /utcOffset is not an offset in minutes/,
    );

    item["utcOffset"] = 90.5;
    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /utcOffset is not an offset in minutes/,
    );

    item["utcOffset"] = -1441;
    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /utcOffset is not an offset in minutes/,
    );

    item["utcOffset"] = 1441;
    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /utcOffset is not an offset in minutes/,
    );
  });

  it("accepts a UTC offset at the edge of a day in either direction", () => {
    const record = JSON.parse(
      serialiseMirrorRecord(bare(anItem({ utcOffset: 60 }))),
    ) as Record<string, unknown>;
    const item = record["item"] as Record<string, unknown>;

    item["utcOffset"] = -1440;
    expect(() => parseMirrorRecord(JSON.stringify(record))).not.toThrow();

    item["utcOffset"] = 1440;
    expect(() => parseMirrorRecord(JSON.stringify(record))).not.toThrow();
  });

  it("refuses an asset whose byte count is not a whole, non-negative number", () => {
    const measured: Asset = {
      id: "asset-a" as Asset["id"],
      filename: "a.png",
      mime: "image/png",
      blob: "hash-a" as Asset["blob"],
      bytes: 1,
    };
    const record = JSON.parse(
      serialiseMirrorRecord(projectMirrorRecord(anItem(), [measured], [], [])),
    ) as Record<string, unknown>;
    const asset = (record["assets"] as Record<string, unknown>[])[0];
    if (asset === undefined) throw new Error("expected an asset");

    asset["bytes"] = "lots";
    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /bytes is not a whole number of bytes/,
    );

    asset["bytes"] = -1;
    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /bytes is not a whole number of bytes/,
    );

    asset["bytes"] = 1.5;
    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /bytes is not a whole number of bytes/,
    );
  });

  it("refuses a pool setting whose value is not a boolean", () => {
    const record = JSON.parse(
      serialiseMirrorRecord(projectPoolSettingRecord(aPoolSetting())),
    ) as Record<string, unknown>;
    record["value"] = "on";

    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /value is not a boolean/,
    );
  });

  it("refuses a template whose folder mode notemap does not know", () => {
    const record = JSON.parse(
      serialiseMirrorRecord(projectTemplateRecord(aTemplate())),
    ) as Record<string, unknown>;
    (record["template"] as Record<string, unknown>)["folder"] = "improvise";

    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /template\.folder is not a folder mode/,
    );
  });

  it("refuses a routing record whose state notemap does not know", () => {
    const delivered: RoutingRecord = {
      id: "routing-1" as RoutingRecord["id"],
      item: "item-1" as ItemId,
      target: { kind: "user" },
      state: "delivered",
      at: at("2026-08-11T09:00:00.000Z"),
    };
    const record = JSON.parse(
      serialiseMirrorRecord(projectMirrorRecord(anItem(), [], [], [delivered])),
    ) as Record<string, unknown>;
    const routing = (record["routing"] as Record<string, unknown>[])[0];
    if (routing === undefined) throw new Error("expected a routing record");
    routing["state"] = "archived";

    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /routing\[0\]\.state/,
    );
  });

  it("refuses a routing record still pending", () => {
    const record = JSON.parse(serialiseMirrorRecord(bare(anItem()))) as Record<
      string,
      unknown
    >;
    record["routing"] = [
      {
        id: "routing-1",
        item: "item-1",
        target: { kind: "user" },
        state: "pending",
        at: "2026-08-11T09:00:00.000Z",
      },
    ];

    expect(() => parseMirrorRecord(JSON.stringify(record))).toThrow(
      /routing\[0\]\.state/,
    );
  });
});
