import type {
  Duration,
  ItemId,
  PayloadTypeName,
  SourceId,
  TagName,
  Timestamp,
} from "../types";

export function itemId(value: string): ItemId {
  return value as ItemId;
}

export function sourceId(value: string): SourceId {
  return value as SourceId;
}

export function payloadTypeName(value: string): PayloadTypeName {
  return value as PayloadTypeName;
}

export function tagName(value: string): TagName {
  return value as TagName;
}

export function timestamp(value: string): Timestamp {
  return value as Timestamp;
}

export function duration(milliseconds: number): Duration {
  return milliseconds as Duration;
}
