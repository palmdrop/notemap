import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  projectDestinationRecord,
  projectMirrorRecord,
  type Destination,
  type DestinationId,
  type DestinationKindName,
  type DestinationMirrorRecord,
  type Item,
  type ItemId,
  type ItemMirrorRecord,
  type PayloadTypeName,
  type SourceId,
  type TagName,
  type Timestamp,
} from "@notemap/core";

export const TEXT = "text" as PayloadTypeName;
export const SCRATCHPAD = "scratchpad" as SourceId;

export function at(value: string): Timestamp {
  return value as Timestamp;
}

export function root(): { path: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), "notemap-mirror-"));
  return {
    path: join(directory, "pool-mirror"),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

type ItemOverrides = {
  readonly id?: string;
  readonly type?: PayloadTypeName;
  readonly text?: string;
  readonly createdAt?: string;
  readonly contentUpdatedAt?: string;
  readonly revisionOf?: string;
  readonly tags?: readonly string[];
};

export function item(overrides: ItemOverrides = {}): Item {
  const createdAt = at(overrides.createdAt ?? "2026-08-11T14:23:05.000Z");
  return {
    id: (overrides.id ?? "item-1") as ItemId,
    source: SCRATCHPAD,
    sourceItemId: "src-1",
    payload: {
      type: overrides.type ?? TEXT,
      content: { text: overrides.text ?? "a thought" },
      metadata: {},
      assets: [],
    },
    tags: (overrides.tags ?? []).map((name) => ({
      name: name as TagName,
      by: { kind: "source", source: SCRATCHPAD },
      addedAt: createdAt,
    })),
    createdAt,
    ...(overrides.contentUpdatedAt === undefined
      ? {}
      : { contentUpdatedAt: at(overrides.contentUpdatedAt) }),
    ...(overrides.revisionOf === undefined
      ? {}
      : { revisionOf: overrides.revisionOf as ItemId }),
    modifiedAt: createdAt,
    revisedInto: [],
  };
}

export function record(overrides: ItemOverrides = {}): ItemMirrorRecord {
  return projectMirrorRecord(item(overrides), [], [], []);
}

type DestinationOverrides = {
  readonly id?: string;
  readonly name?: string;
  readonly kind?: string;
  readonly settings?: Record<string, string>;
  readonly retiredAt?: string;
};

export function destination(overrides: DestinationOverrides = {}): Destination {
  const createdAt = at("2026-08-17T09:00:00.000Z");
  return {
    id: (overrides.id ?? "vault") as DestinationId,
    name: overrides.name ?? "Vault",
    kind: (overrides.kind ?? "filesystem") as DestinationKindName,
    settings: overrides.settings ?? { root: "~/notes" },
    ...(overrides.retiredAt === undefined
      ? {}
      : { retiredAt: at(overrides.retiredAt) }),
    createdAt,
    modifiedAt: createdAt,
  };
}

export function destinationRecord(
  overrides: DestinationOverrides = {},
): DestinationMirrorRecord {
  return projectDestinationRecord(destination(overrides));
}
