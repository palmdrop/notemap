import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  projectMirrorRecord,
  type Item,
  type ItemId,
  type MirrorRecord,
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
  };
}

export function record(overrides: ItemOverrides = {}): MirrorRecord {
  return projectMirrorRecord(item(overrides), [], [], []);
}
