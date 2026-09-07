import { canonicalJson } from "#utils/json";
import type { JsonObject } from "#types/json";
import type { Agent } from "#types/domain/agent";
import type { Asset, AssetRef } from "#types/domain/asset";
import type { Artifact } from "#types/domain/enrichment";
import type {
  ArtifactId,
  AssetId,
  BlobHash,
  CapabilityName,
  DestinationId,
  DestinationKindName,
  EnrichmentName,
  ItemId,
  PayloadTypeName,
  ProviderName,
  RoutingRecordId,
  RoutingTemplateId,
  SourceId,
  TagName,
  Timestamp,
} from "#types/domain/ids";
import type { DestinationRecord } from "#types/domain/destination";
import type { ArchiveState, ItemRecord, Tag } from "#types/domain/item";
import type { MirrorRecord } from "#types/domain/mirror";
import type { Payload } from "#types/domain/payload";
import type { FolderMode, RoutingTemplateRecord } from "#types/domain/template";
import type {
  AppliedTemplate,
  RoutingRecord,
  RoutingRecordState,
  RoutingTarget,
  StoredContent,
  StoredOutput,
} from "#types/domain/routing";

/** Sorted at every depth, including inside a payload's open JSON, so one state has one serialisation. */
export function serialiseMirrorRecord(record: MirrorRecord): string {
  return `${canonicalJson(record, 2)}\n`;
}

/** Rejects rather than salvages: a half-record would let verify call a mirror healthy that cannot rebuild. */
export function parseMirrorRecord(source: string): MirrorRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    throw new TypeError(`not a mirror record: ${String(cause)}`, { cause });
  }

  const root = object(parsed, "the record");
  const kind = text(root["kind"], "kind");

  switch (kind) {
    case "item":
      return {
        kind: "item",
        item: readItem(root["item"], "item"),
        assets: list(root["assets"], "assets", readAsset),
        artifacts: list(root["artifacts"], "artifacts", readArtifact),
        routing: list(root["routing"], "routing", readRouting),
        modifiedAt: stamp(root["modifiedAt"], "modifiedAt"),
      };
    case "destination":
      return {
        kind: "destination",
        destination: readDestination(root["destination"], "destination"),
        modifiedAt: stamp(root["modifiedAt"], "modifiedAt"),
      };
    case "template":
      return {
        kind: "template",
        template: readTemplate(root["template"], "template"),
        modifiedAt: stamp(root["modifiedAt"], "modifiedAt"),
      };
    default:
      reject("kind", "a mirror record kind");
  }
}

function readDestination(value: unknown, at: string): DestinationRecord {
  const row = object(value, at);
  return {
    id: text(row["id"], `${at}.id`) as DestinationId,
    name: text(row["name"], `${at}.name`),
    kind: text(row["kind"], `${at}.kind`) as DestinationKindName,
    settings: object(row["settings"], `${at}.settings`) as JsonObject,
    ...present("retiredAt", row, at, stamp),
    createdAt: stamp(row["createdAt"], `${at}.createdAt`),
  };
}

function readTemplate(value: unknown, at: string): RoutingTemplateRecord {
  const row = object(value, at);
  return {
    id: text(row["id"], `${at}.id`) as RoutingTemplateId,
    name: text(row["name"], `${at}.name`),
    destination: text(row["destination"], `${at}.destination`) as DestinationId,
    capability: text(row["capability"], `${at}.capability`) as CapabilityName,
    arguments: object(row["arguments"], `${at}.arguments`) as JsonObject,
    folder: readFolderMode(row["folder"], `${at}.folder`),
    ...present(
      "triggerTag",
      row,
      at,
      (raw, where) => text(raw, where) as TagName,
    ),
    ...present("establishedAt", row, at, stamp),
    createdAt: stamp(row["createdAt"], `${at}.createdAt`),
  };
}

/** `establish` is carried as written: what it resolves to is decided when a decision is made. */
function readFolderMode(value: unknown, at: string): FolderMode {
  const spelling = text(value, at);
  if (
    spelling !== "create" &&
    spelling !== "require" &&
    spelling !== "establish"
  ) {
    reject(at, "a folder mode");
  }
  return spelling;
}

function readItem(value: unknown, at: string): ItemRecord {
  const row = object(value, at);
  return {
    id: text(row["id"], `${at}.id`) as ItemId,
    source: text(row["source"], `${at}.source`) as SourceId,
    sourceItemId: text(row["sourceItemId"], `${at}.sourceItemId`),
    payload: readPayload(row["payload"], `${at}.payload`),
    tags: list(row["tags"], `${at}.tags`, readTag),
    createdAt: stamp(row["createdAt"], `${at}.createdAt`),
    ...present("utcOffset", row, at, minutes),
    ...present("contentUpdatedAt", row, at, stamp),
    ...present(
      "revisionOf",
      row,
      at,
      (raw, where) => text(raw, where) as ItemId,
    ),
    ...present("archived", row, at, readArchive),
  };
}

function readPayload(value: unknown, at: string): Payload {
  const row = object(value, at);
  return {
    type: text(row["type"], `${at}.type`) as PayloadTypeName,
    content: object(row["content"], `${at}.content`) as JsonObject,
    metadata: object(row["metadata"], `${at}.metadata`) as JsonObject,
    assets: list(row["assets"], `${at}.assets`, readAssetRef),
  };
}

function readAssetRef(value: unknown, at: string): AssetRef {
  const row = object(value, at);
  return {
    slot: text(row["slot"], `${at}.slot`),
    asset: text(row["asset"], `${at}.asset`) as AssetId,
  };
}

function readTag(value: unknown, at: string): Tag {
  const row = object(value, at);
  return {
    name: text(row["name"], `${at}.name`) as TagName,
    by: readAgent(row["by"], `${at}.by`),
    addedAt: stamp(row["addedAt"], `${at}.addedAt`),
  };
}

function readArchive(value: unknown, at: string): ArchiveState {
  const row = object(value, at);
  return {
    archivedAt: stamp(row["archivedAt"], `${at}.archivedAt`),
    ...present("reason", row, at, text),
  };
}

function readAgent(value: unknown, at: string): Agent {
  const row = object(value, at);
  const kind = text(row["kind"], `${at}.kind`);

  switch (kind) {
    case "notemap":
      return { kind: "notemap" };
    case "person":
      return { kind: "person" };
    case "provider":
      return {
        kind: "provider",
        provider: text(row["provider"], `${at}.provider`) as ProviderName,
      };
    case "source":
      return {
        kind: "source",
        source: text(row["source"], `${at}.source`) as SourceId,
      };
    default:
      throw new TypeError(`not a mirror record: ${at}.kind is not an agent`);
  }
}

function readAsset(value: unknown, at: string): Asset {
  const row = object(value, at);
  return {
    id: text(row["id"], `${at}.id`) as AssetId,
    filename: text(row["filename"], `${at}.filename`),
    mime: text(row["mime"], `${at}.mime`),
    blob: text(row["blob"], `${at}.blob`) as BlobHash,
    bytes: whole(row["bytes"], `${at}.bytes`),
  };
}

function readArtifact(value: unknown, at: string): Artifact {
  const row = object(value, at);
  return {
    id: text(row["id"], `${at}.id`) as ArtifactId,
    item: text(row["item"], `${at}.item`) as ItemId,
    enrichment: text(row["enrichment"], `${at}.enrichment`) as EnrichmentName,
    by: readAgent(row["by"], `${at}.by`),
    createdAt: stamp(row["createdAt"], `${at}.createdAt`),
    content: object(row["content"], `${at}.content`) as JsonObject,
    assets: list(row["assets"], `${at}.assets`, readAssetRef),
    ...present(
      "correctionOf",
      row,
      at,
      (raw, where) => text(raw, where) as ArtifactId,
    ),
  };
}

function readRouting(value: unknown, at: string): RoutingRecord {
  const row = object(value, at);
  return {
    id: text(row["id"], `${at}.id`) as RoutingRecordId,
    item: text(row["item"], `${at}.item`) as ItemId,
    target: readTarget(row["target"], `${at}.target`),
    state: readState(row["state"], `${at}.state`),
    at: stamp(row["at"], `${at}.at`),
    ...present("applied", row, at, readApplied),
    ...present("pointer", row, at, text),
    ...present("url", row, at, text),
    ...present("output", row, at, readOutput),
  };
}

/** A template a record came from may have been deleted since; the record still says which. */
function readApplied(value: unknown, at: string): AppliedTemplate {
  const row = object(value, at);
  return {
    template: text(row["template"], `${at}.template`) as RoutingTemplateId,
    firedByTag: flag(row["firedByTag"], `${at}.firedByTag`),
  };
}

/** Both halves optional, and an output that is neither is not one a projection writes. */
function readOutput(value: unknown, at: string): StoredOutput {
  const row = object(value, at);
  return {
    ...present("content", row, at, readOutputContent),
    ...present("note", row, at, text),
  };
}

function readOutputContent(value: unknown, at: string): StoredContent {
  const row = object(value, at);
  return {
    blob: text(row["blob"], `${at}.blob`) as BlobHash,
    mediaType: text(row["mediaType"], `${at}.mediaType`),
  };
}

/** Read rather than assumed: salvaging a file that says `pending` would invent an arrival. */
function readState(value: unknown, at: string): RoutingRecordState {
  const spelling = text(value, at);
  if (spelling !== "pending" && spelling !== "delivered") {
    reject(at, "a routing record state");
  }
  return spelling;
}

function readTarget(value: unknown, at: string): RoutingTarget {
  const row = object(value, at);
  const kind = text(row["kind"], `${at}.kind`);

  switch (kind) {
    case "destination":
      return {
        kind: "destination",
        destination: text(
          row["destination"],
          `${at}.destination`,
        ) as DestinationId,
        capability: text(
          row["capability"],
          `${at}.capability`,
        ) as CapabilityName,
        arguments: object(row["arguments"], `${at}.arguments`) as JsonObject,
      };
    case "user":
      return { kind: "user", ...present("note", row, at, text) };
    default:
      throw new TypeError(
        `not a mirror record: ${at}.kind is not a routing target`,
      );
  }
}

function reject(at: string, expected: string): never {
  throw new TypeError(`not a mirror record: ${at} is not ${expected}`);
}

function object(value: unknown, at: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    reject(at, "an object");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, at: string): string {
  if (typeof value !== "string") reject(at, "a string");
  return value;
}

function flag(value: unknown, at: string): boolean {
  if (typeof value !== "boolean") reject(at, "a boolean");
  return value;
}

/** Every real zone is a whole number of minutes from UTC, and none is a day away. */
function minutes(value: unknown, at: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < -1440 ||
    value > 1440
  ) {
    reject(at, "an offset in minutes");
  }
  return value;
}

function whole(value: unknown, at: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    reject(at, "a whole number of bytes");
  }
  return value;
}

function stamp(value: unknown, at: string): Timestamp {
  const spelling = text(value, at);
  if (Number.isNaN(Date.parse(spelling))) reject(at, "a timestamp");
  return spelling as Timestamp;
}

function list<T>(
  value: unknown,
  at: string,
  each: (item: unknown, at: string) => T,
): readonly T[] {
  if (!Array.isArray(value)) reject(at, "a list");
  return value.map((item, index) => each(item, `${at}[${index}]`));
}

/**
 * An absent optional field stays absent rather than becoming an explicit
 * `undefined`, which `exactOptionalPropertyTypes` makes a different value.
 */
function present<K extends string, T>(
  key: K,
  row: Record<string, unknown>,
  at: string,
  read: (value: unknown, at: string) => T,
): { [P in K]?: T } {
  const value = row[key];
  if (value === undefined) return {} as { [P in K]?: T };
  return { [key]: read(value, `${at}.${key}`) } as { [P in K]?: T };
}
