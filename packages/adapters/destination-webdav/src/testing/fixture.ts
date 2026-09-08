import type {
  Asset,
  AssetId,
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
import { WEBDAV } from "../settings";
import type { DavServer } from "./dav-server";

export const TEXT = "text" as PayloadTypeName;
export const SCRATCHPAD = "scratchpad" as SourceId;
export const VAULT = "vault" as DestinationId;
export const ACCOUNT = "nextcloud";

export function at(value: string): Timestamp {
  return value as Timestamp;
}

/** A destination row of this kind, which is what every call is handed. */
export function destinationRow(settings: {
  account?: string;
  root: string;
}): Destination {
  return {
    id: VAULT,
    name: "Vault",
    kind: WEBDAV,
    settings: { account: settings.account ?? ACCOUNT, root: settings.root },
    createdAt: at("2026-09-01T09:00:00.000Z"),
    modifiedAt: at("2026-09-01T09:00:00.000Z"),
  };
}

/** The host half, as `ports.ts` supplies it, over a server standing in for Nextcloud. */
export function resolverFor(server: DavServer): CredentialResolver {
  return (account) =>
    account === ACCOUNT
      ? Promise.resolve({
          baseUrl: server.baseUrl,
          username: server.username,
          password: server.password,
        })
      : Promise.reject(new Error(`no webdav account named ${account}`));
}

export function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * An asset whose bytes are held in memory, and which counts its own opens. The
 * blob is a digest of the content in the pool, so tests that care what an asset
 * ends up called say which one they mean rather than sharing one.
 */
export function deliveredAsset(
  slot: string,
  filename: string,
  content: Uint8Array,
  blob = "0".repeat(64),
): DeliveredAsset & { opens: () => number } {
  let opens = 0;
  const asset: Asset = {
    id: `asset-${filename}` as AssetId,
    filename,
    mime: "application/octet-stream",
    blob: blob as Asset["blob"],
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
  const createdAt = at(overrides.createdAt ?? "2026-09-01T14:23:05.000Z");

  return {
    item: (overrides.item ?? "item-1") as ItemId,
    destination: VAULT,
    capability: (overrides.capability ?? "create") as CapabilityName,
    arguments: overrides.arguments ?? { directory: "inbox" },
    source: SCRATCHPAD,
    payload: {
      type: overrides.type ?? TEXT,
      content: overrides.content ?? { text: "a thought" },
      metadata: {},
      assets: [],
    },
    tags: (overrides.tags ?? []).map((name) => ({
      name: name as TagName,
      by: { kind: "source", source: SCRATCHPAD },
      addedAt: createdAt,
    })),
    createdAt,
    artifacts: [],
    assets: overrides.assets ?? [],
  };
}
