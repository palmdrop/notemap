import fc from "fast-check";

import type { JsonObject } from "#types/json";
import type { Agent } from "#types/domain/agent";
import type { Asset, AssetRef } from "#types/domain/asset";
import type { Destination } from "#types/domain/destination";
import type { Artifact } from "#types/domain/enrichment";
import type { DestinationId, Timestamp } from "#types/domain/ids";
import type { Item, RoutingSummary } from "#types/domain/item";
import type { PoolSettingRecord } from "#types/domain/pool-setting";
import type { RoutingRecord } from "#types/domain/routing";
import type { RoutingTemplate } from "#types/domain/template";

/**
 * Generated pool state, for the property that keeps the mirror honest. Every
 * optional field is genuinely sometimes absent — a record losing one it never
 * generated would be a test that passes for the wrong reason.
 */

/** Well inside what `Date` represents, and away from the leap-second edges. */
const INSTANT = fc.integer({ min: 0, max: 4_102_444_800_000 });

const stamp = (): fc.Arbitrary<Timestamp> =>
  INSTANT.map((millis) => new Date(millis).toISOString() as Timestamp);

const name = (): fc.Arbitrary<string> => fc.string({ minLength: 1 });

const branded = <T>(): fc.Arbitrary<T> => name() as fc.Arbitrary<T>;

/** Open JSON, exactly as a client may send it, including nested objects and nulls. */
const jsonObject = (): fc.Arbitrary<JsonObject> =>
  fc.dictionary(
    fc.string(),
    fc.jsonValue().map(oneZero) as fc.Arbitrary<never>,
    {
      maxKeys: 4,
    },
  ) as fc.Arbitrary<JsonObject>;

/**
 * JSON has one zero — `JSON.stringify(-0)` is `"0"` — and the pool collapses it
 * at the same boundary, since payload content is stored as JSON text. So `-0`
 * is not a value notemap holds anywhere, and generating one would test the
 * mirror against a state the pool cannot be in.
 */
function oneZero(value: unknown): unknown {
  if (Object.is(value, -0)) return 0;
  if (Array.isArray(value)) return value.map(oneZero);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, each]) => [key, oneZero(each)]),
    );
  }
  return value;
}

const agent = (): fc.Arbitrary<Agent> =>
  fc.oneof(
    fc.constant<Agent>({ kind: "notemap" }),
    fc.constant<Agent>({ kind: "person" }),
    branded<string>().map<Agent>((provider) => ({
      kind: "provider",
      provider: provider as never,
    })),
    branded<string>().map<Agent>((source) => ({
      kind: "source",
      source: source as never,
    })),
  );

const assetRef = (): fc.Arbitrary<AssetRef> =>
  fc.record({ slot: name(), asset: branded() });

/** Unique by slot, since one payload cannot fill a slot twice. */
const assetRefs = (): fc.Arbitrary<AssetRef[]> =>
  fc.uniqueArray(assetRef(), {
    maxLength: 3,
    selector: (ref) => ref.slot,
  });

export const asset = (): fc.Arbitrary<Asset> =>
  fc.record({
    id: branded(),
    filename: name(),
    mime: name(),
    blob: branded(),
    bytes: fc.nat(),
  });

/** Drawn as the pool derives it: one `to` per record, and `pending` among them. */
const routingSummary = (): fc.Arbitrary<RoutingSummary> =>
  fc
    .array(
      fc.oneof(
        fc.record({
          kind: fc.constant("destination" as const),
          destination: branded<DestinationId>(),
        }),
        fc.record({ kind: fc.constant("user" as const) }),
      ),
      { minLength: 1, maxLength: 3 },
    )
    .chain((went) =>
      fc.nat({ max: went.length }).map((pending) => ({
        records: went.length,
        pending,
        to: went.filter(
          (one, at) =>
            went.findIndex((other) =>
              one.kind === "destination"
                ? other.kind === "destination" &&
                  other.destination === one.destination
                : other.kind === "user",
            ) === at,
        ),
        templates: [],
      })),
    );

export const item = (): fc.Arbitrary<Item> =>
  fc.record(
    {
      id: branded(),
      source: branded(),
      sourceItemId: name(),
      payload: fc.record({
        type: branded(),
        content: jsonObject(),
        metadata: jsonObject(),
        assets: assetRefs(),
      }),
      tags: fc.uniqueArray(
        fc.record({ name: branded<never>(), by: agent(), addedAt: stamp() }),
        { maxLength: 3, selector: (tag) => tag.name },
      ),
      createdAt: stamp(),
      utcOffset: fc.integer({ min: -720, max: 840 }),
      contentUpdatedAt: stamp(),
      revisionOf: branded(),
      archived: fc.record(
        { archivedAt: stamp(), reason: name() },
        { requiredKeys: ["archivedAt"] },
      ),
      modifiedAt: stamp(),
      revisedInto: fc.array(branded<never>(), { maxLength: 2 }),
      routing: routingSummary(),
    },
    {
      requiredKeys: [
        "id",
        "source",
        "sourceItemId",
        "payload",
        "tags",
        "createdAt",
        "modifiedAt",
        "revisedInto",
      ],
    },
  );

export const artifact = (): fc.Arbitrary<Artifact> =>
  fc.record(
    {
      id: branded(),
      item: branded(),
      enrichment: branded(),
      by: agent(),
      createdAt: stamp(),
      content: jsonObject(),
      assets: assetRefs(),
      correctionOf: branded(),
    },
    {
      requiredKeys: [
        "id",
        "item",
        "enrichment",
        "by",
        "createdAt",
        "content",
        "assets",
      ],
    },
  );

export const routingRecord = (): fc.Arbitrary<RoutingRecord> =>
  fc.record(
    {
      id: branded(),
      item: branded(),
      target: fc.oneof(
        fc.record(
          {
            kind: fc.constant("destination" as const),
            destination: branded<never>(),
            capability: branded<never>(),
            arguments: jsonObject(),
            content: jsonObject(),
          },
          { requiredKeys: ["kind", "destination", "capability", "arguments"] },
        ),
        fc.record(
          { kind: fc.constant("user" as const), note: name() },
          { requiredKeys: ["kind"] },
        ),
      ),
      state: fc.constantFrom("pending" as const, "delivered" as const),
      at: stamp(),
      applied: fc.record({
        template: branded<never>(),
        firedByTag: fc.boolean(),
      }),
      pointer: name(),
      url: name(),
      output: fc.record(
        {
          content: fc.record({ blob: branded<never>(), mediaType: name() }),
          note: name(),
        },
        { requiredKeys: [] },
      ),
    },
    { requiredKeys: ["id", "item", "target", "state", "at"] },
  );

/** The mirror's other units, whose losslessness the same property covers. */
export const destination = (): fc.Arbitrary<Destination> =>
  fc.record(
    {
      id: branded(),
      name: name(),
      kind: branded(),
      settings: jsonObject(),
      retiredAt: stamp(),
      createdAt: stamp(),
      modifiedAt: stamp(),
    },
    {
      requiredKeys: [
        "id",
        "name",
        "kind",
        "settings",
        "createdAt",
        "modifiedAt",
      ],
    },
  );

export const poolSettingRecord = (): fc.Arbitrary<PoolSettingRecord> =>
  fc.record({ name: branded(), value: fc.boolean(), changedAt: stamp() });

export type PoolState = {
  readonly item: Item;
  readonly assets: readonly Asset[];
  readonly artifacts: readonly Artifact[];
  readonly routing: readonly RoutingRecord[];
};

/** Unique by id everywhere, because the pool it stands for is. */
export const routingTemplate = (): fc.Arbitrary<RoutingTemplate> =>
  fc.record(
    {
      id: branded(),
      name: name(),
      destination: branded<never>(),
      capability: branded<never>(),
      arguments: jsonObject(),
      folder: fc.constantFrom(
        "create" as const,
        "require" as const,
        "establish" as const,
      ),
      triggerTag: name() as fc.Arbitrary<never>,
      establishedAt: stamp(),
      createdAt: stamp(),
      modifiedAt: stamp(),
      fired: fc.record(
        { records: fc.nat({ max: 200 }), lastAt: stamp() },
        { requiredKeys: ["records"] },
      ),
    },
    {
      requiredKeys: [
        "id",
        "name",
        "destination",
        "capability",
        "arguments",
        "folder",
        "createdAt",
        "modifiedAt",
        "fired",
      ],
    },
  );

export const poolState = (): fc.Arbitrary<PoolState> =>
  fc.record({
    item: item(),
    assets: fc.uniqueArray(asset(), {
      maxLength: 3,
      selector: (value) => value.id,
    }),
    artifacts: fc.uniqueArray(artifact(), {
      maxLength: 3,
      selector: (value) => value.id,
    }),
    routing: fc.uniqueArray(routingRecord(), {
      maxLength: 3,
      selector: (value) => value.id,
    }),
  });
