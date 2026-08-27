import { describe, expect, it } from "vitest";

import type { Operation, PendingOperation } from "#outbox/operations";
import { releasedBy } from "./assets";

const AT = "2026-08-26T12:00:00.000Z";

function payload(...assets: string[]) {
  return {
    type: "image",
    content: {},
    metadata: {},
    assets: assets.map((asset) => ({ slot: "image", asset })),
  };
}

function capture(id: string, ...assets: string[]): Operation {
  return {
    kind: "capture",
    envelope: {
      id,
      source: "web",
      sourceItemId: id,
      capturedAt: AT,
      payload: payload(...assets),
    },
  };
}

function edit(item: string, ...assets: string[]): Operation {
  return {
    kind: "edit",
    item,
    envelope: {
      source: "web",
      sourceItemId: "minted",
      payload: payload(...assets),
    },
  };
}

function queued(...operations: Operation[]): readonly PendingOperation[] {
  return operations.map((operation, at) => ({
    id: `op-${String(at)}`,
    operation,
    at: AT,
    state: "pending",
  }));
}

describe("what leaves the outbox with an operation", () => {
  it("is the assets it named, where nothing else is waiting to name them", () => {
    expect(releasedBy(capture("one", "asset-1"), queued())).toEqual([
      "asset-1",
    ]);
  });

  it("is nothing an operation still queued names too", () => {
    const held = queued(edit("one", "asset-1"));

    expect(releasedBy(capture("one", "asset-1"), held)).toEqual([]);
  });

  it("is an edit's own bytes, which no capture ever named", () => {
    expect(releasedBy(edit("one", "asset-2"), queued())).toEqual(["asset-2"]);
  });

  it("is nothing for an operation that names no asset at all", () => {
    expect(releasedBy({ kind: "archive", item: "one" }, queued())).toEqual([]);
  });
});
