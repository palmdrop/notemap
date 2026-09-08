import type {
  Asset,
  AssetId,
  AssetRef,
  CapabilityName,
  DeliveredAsset,
  Delivery,
  Destination,
  DestinationId,
  ItemId,
  JsonObject,
  PayloadTypeName,
  SourceId,
  TagName,
  Timestamp,
} from "@notemap/core";

import type { CredentialResolver } from "../credentials";
import { ARENA } from "../settings";
import type { ArenaServer } from "./arena-server";

export const NOTE = "note" as PayloadTypeName;
export const SCRATCHPAD = "scratchpad" as SourceId;
export const BOARD = "board" as DestinationId;
export const ACCOUNT = "are-na";

export function at(value: string): Timestamp {
  return value as Timestamp;
}

/** A destination row of this kind, which is what every call is handed. */
export function destinationRow(
  settings: { account?: string } = {},
): Destination {
  return {
    id: BOARD,
    name: "Board",
    kind: ARENA,
    settings: { account: settings.account ?? ACCOUNT },
    createdAt: at("2026-09-08T09:00:00.000Z"),
    modifiedAt: at("2026-09-08T09:00:00.000Z"),
  };
}

/** The host half, as `ports.ts` supplies it, over a server standing in for are.na. */
export function resolverFor(server: ArenaServer): CredentialResolver {
  return (account) =>
    account === ACCOUNT
      ? Promise.resolve({ token: server.token })
      : Promise.reject(new Error(`no arena account named ${account}`));
}

export function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** An asset whose bytes are held in memory, and which counts its own opens. */
export function deliveredAsset(
  slot: string,
  filename: string,
  content: Uint8Array,
  mime = "image/png",
): DeliveredAsset & { opens: () => number } {
  let opens = 0;
  const asset: Asset = {
    id: `asset-${filename}` as AssetId,
    filename,
    mime,
    blob: "0".repeat(64) as Asset["blob"],
    bytes: content.byteLength,
  };

  return {
    slot,
    asset,
    open: async () => {
      opens += 1;
      return (async function* () {
        yield content;
      })();
    },
    opens: () => opens,
  };
}

type DeliveryOverrides = {
  readonly capability?: string;
  readonly arguments?: JsonObject;
  readonly type?: PayloadTypeName;
  readonly content?: JsonObject;
  readonly tags?: readonly string[];
  readonly assets?: readonly DeliveredAsset[];
  readonly createdAt?: string;
  readonly item?: string;
};

export function delivery(overrides: DeliveryOverrides = {}): Delivery {
  const createdAt = at(overrides.createdAt ?? "2026-09-08T14:23:05.000Z");
  const assets = overrides.assets ?? [];

  return {
    item: (overrides.item ?? "item-1") as ItemId,
    destination: BOARD,
    capability: (overrides.capability ?? "create") as CapabilityName,
    arguments: overrides.arguments ?? { channel: "a-channel" },
    source: SCRATCHPAD,
    payload: {
      type: overrides.type ?? NOTE,
      content: overrides.content ?? { text: "a thought" },
      metadata: {},
      assets: assets.map((each): AssetRef => ({
        slot: each.slot,
        asset: each.asset.id,
      })),
    },
    tags: (overrides.tags ?? []).map((name) => ({
      name: name as TagName,
      by: { kind: "source", source: SCRATCHPAD },
      addedAt: createdAt,
    })),
    createdAt,
    artifacts: [],
    assets,
  };
}
