import { mkdtempSync, rmSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  Asset,
  AssetId,
  CapabilityName,
  Delivery,
  DeliveredAsset,
  DestinationId,
  ItemId,
  JsonObject,
  PayloadTypeName,
  SourceId,
  TagName,
  Timestamp,
} from "@notemap/core";

export const TEXT = "text" as PayloadTypeName;
export const SCRATCHPAD = "scratchpad" as SourceId;
export const VAULT = "vault" as DestinationId;

export function at(value: string): Timestamp {
  return value as Timestamp;
}

export function root(): { path: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), "notemap-destination-"));
  return {
    path: join(directory, "vault"),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

export function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** An asset whose bytes are held in memory, and which counts its own opens. */
export function deliveredAsset(
  slot: string,
  filename: string,
  content: Uint8Array,
): DeliveredAsset & { opens: () => number } {
  let opens = 0;
  const asset: Asset = {
    id: `asset-${filename}` as AssetId,
    filename,
    mime: "application/octet-stream",
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
  readonly target?: JsonObject;
  readonly type?: PayloadTypeName;
  readonly content?: JsonObject;
  readonly tags?: readonly string[];
  readonly assets?: readonly DeliveredAsset[];
  readonly createdAt?: string;
};

export function delivery(overrides: DeliveryOverrides = {}): Delivery {
  const createdAt = at(overrides.createdAt ?? "2026-08-11T14:23:05.000Z");

  return {
    item: "item-1" as ItemId,
    destination: VAULT,
    capability: (overrides.capability ?? "create-file") as CapabilityName,
    target: overrides.target ?? { directory: "inbox" },
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

/** Every file under the root, path relative to it, so debris is as visible as a note. */
export async function filesUnder(path: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path, { recursive: true, withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(path.length + 1))
    .sort();
}
