import { describe, expect, it } from "vitest";

import type { Item } from "../api/types";
import type { PendingOperation } from "../outbox/operations";
import { createMemoryStore } from "./memory-store";

function anItem(id: string): Item {
  return {
    id,
    source: "test",
    sourceItemId: id,
    payload: { type: "text", content: { text: id }, metadata: {}, assets: [] },
    tags: [],
    createdAt: "2026-08-17T00:00:00.000Z",
    modifiedAt: "2026-08-17T00:00:00.000Z",
    revisedInto: [],
  };
}

function anOperation(id: string): PendingOperation {
  return {
    id,
    operation: { kind: "unarchive", item: "item-1" },
    at: "2026-08-17T00:00:00.000Z",
    state: "pending",
  };
}

describe("the in-memory store", () => {
  it("reads back the operations it was given, and forgets removed ones", async () => {
    const store = createMemoryStore();

    await store.writeOperation(anOperation("a"));
    await store.writeOperation(anOperation("b"));
    await store.removeOperation("a");

    expect((await store.readOutbox()).map((held) => held.id)).toEqual(["b"]);
  });

  it("replaces an operation written again under the same id", async () => {
    const store = createMemoryStore();

    await store.writeOperation(anOperation("a"));
    await store.writeOperation({ ...anOperation("a"), state: "sending" });

    const outbox = await store.readOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.state).toBe("sending");
  });

  it("reads back the items it was given, and forgets removed ones", async () => {
    const store = createMemoryStore();

    await store.writeItems([anItem("one"), anItem("two")]);
    await store.removeItems(["one"]);

    expect((await store.readItems()).map((item) => item.id)).toEqual(["two"]);
  });
});
