import { expect } from "vitest";

import type {
  CaptureEnvelope,
  CaptureOutcome,
  Item,
  ItemId,
  JsonObject,
  PayloadTypeName,
  Pool,
  PoolConfig,
  Result,
  SourceId,
  TagName,
  Timestamp,
} from "../types";
import { duration, payloadTypeName, sourceId, timestamp } from "./brands";
import { createStubPool, stubPorts } from "./stub-pool";

/** A client that captures offline and replays its own ids. */
export const scratchpad = sourceId("scratchpad");

/** A source that is re-read rather than replayed, and so supplies no id. */
export const watchedFolder = sourceId("watched-folder");

export const text = payloadTypeName("text");

export const testConfig: PoolConfig = {
  sources: [
    { id: scratchpad, autoRequest: [] },
    { id: watchedFolder, autoRequest: [] },
  ],
  payloadTypes: [
    {
      name: text,
      contentSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      requiredSlots: [],
    },
  ],
  enrichments: [],
  retry: {
    maxAttempts: 3,
    initialBackoff: duration(1_000),
    maxBackoff: duration(60_000),
  },
};

export function createTestPool(config: PoolConfig = testConfig): Pool {
  return createStubPool(config, stubPorts());
}

/** Minutes of one fixed morning, so a test can order captures without a clock. */
export function morningAt(minute: number): Timestamp {
  return timestamp(`2026-08-03T09:${String(minute).padStart(2, "0")}:00Z`);
}

export type CaptureOptions = {
  readonly id?: ItemId;
  readonly source?: SourceId;
  readonly sourceItemId?: string;
  readonly capturedAt?: Timestamp;
  readonly payloadType?: PayloadTypeName;
  readonly text?: string;
  readonly content?: JsonObject;
  readonly tags?: readonly TagName[];
};

let sourceItemIds = 0;

/** Unique unless a test says otherwise, so unrelated captures never share an identity. */
function nextSourceItemId(): string {
  sourceItemIds += 1;
  return `note-${sourceItemIds}`;
}

export function textCapture(options: CaptureOptions = {}): CaptureEnvelope {
  return {
    ...(options.id === undefined ? {} : { id: options.id }),
    source: options.source ?? scratchpad,
    sourceItemId: options.sourceItemId ?? nextSourceItemId(),
    capturedAt: options.capturedAt ?? morningAt(0),
    payload: {
      type: options.payloadType ?? text,
      content: options.content ?? {
        text: options.text ?? "a thought worth keeping",
      },
      metadata: {},
      assets: [],
    },
    ...(options.tags === undefined ? {} : { tags: options.tags }),
  };
}

export function expectOk<T, E>(result: Result<T, E>): T {
  if (result.kind !== "ok") {
    expect.unreachable(
      `expected ok, got refusal ${JSON.stringify(result.refusal)}`,
    );
  }
  return result.value;
}

export function expectRefused<T, E>(result: Result<T, E>): E {
  if (result.kind !== "refused") {
    expect.unreachable(`expected refusal, got ok ${JSON.stringify(result)}`);
  }
  return result.refusal;
}

export function expectCaptured(outcome: CaptureOutcome): Item {
  if (outcome.kind !== "captured") {
    expect.unreachable(`expected a capture, got ${outcome.kind}`);
  }
  return outcome.item;
}

export function expectAlreadyCaptured(
  outcome: CaptureOutcome,
): Extract<CaptureOutcome, { kind: "already-captured" }> {
  if (outcome.kind !== "already-captured") {
    expect.unreachable(
      `expected an already-captured report, got ${outcome.kind}`,
    );
  }
  return outcome;
}
