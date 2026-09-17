import { expect, it } from "vitest";

import type { Destination, Item, TagUse } from "#api/types";
import type { PendingOperation } from "#outbox/operations";
import type { ClientStore } from "#ports/store";

export function anItem(id: string): Item {
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

export function anOperation(id: string): PendingOperation {
  return {
    id,
    operation: { kind: "unarchive", item: "item-1" },
    at: "2026-08-17T00:00:00.000Z",
    state: "pending",
  };
}

export function aDestination(id: string): Destination {
  return {
    id,
    name: id,
    kind: "fs",
    settings: {},
    retired: false,
  };
}

export function aFile(): File {
  return new File(["bytes"], "a photo.png", { type: "image/png" });
}

export function aTag(name: string, items = 1): TagUse {
  return { name, items };
}

const T0 = "2026-08-17T00:00:00.000Z";
const T1 = "2026-08-17T00:01:00.000Z";
const T2 = "2026-08-17T00:02:00.000Z";

/** What every adapter answers the same, run against each. */
export function storeContract(open: () => Promise<ClientStore>): void {
  it("reads back the operations it was given, and forgets removed ones", async () => {
    const store = await open();

    await store.writeOperation(anOperation("a"));
    await store.writeOperation(anOperation("b"));
    await store.removeOperation("a");

    expect((await store.readOutbox()).map((held) => held.id)).toEqual(["b"]);
  });

  it("replaces an operation written again under the same id", async () => {
    const store = await open();

    await store.writeOperation(anOperation("a"));
    await store.writeOperation({ ...anOperation("a"), state: "sending" });

    const outbox = await store.readOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.state).toBe("sending");
  });

  it("leases an operation to one asker, and to the next once it lapses", async () => {
    const store = await open();
    await store.writeOperation(anOperation("a"));

    const leased = await store.leaseOperation("a", T0, T1);
    expect(leased?.state).toBe("sending");
    expect(leased?.until).toBe(T1);
    expect((await store.readOutbox())[0]?.until).toBe(T1);

    expect(await store.leaseOperation("a", T0, T1)).toBeUndefined();
    expect((await store.leaseOperation("a", T1, T2))?.until).toBe(T2);
  });

  it("leases again what was written back as not sending", async () => {
    const store = await open();
    await store.writeOperation(anOperation("a"));
    await store.leaseOperation("a", T0, T1);
    await store.writeOperation({ ...anOperation("a"), state: "unreachable" });

    expect((await store.leaseOperation("a", T0, T1))?.state).toBe("sending");
  });

  it("leases nothing it does not hold, or holds as refused", async () => {
    const store = await open();
    await store.writeOperation({ ...anOperation("a"), state: "refused" });

    expect(await store.leaseOperation("a", T0, T1)).toBeUndefined();
    expect(await store.leaseOperation("b", T0, T1)).toBeUndefined();
  });

  it("reads back the items it was given, and forgets removed ones", async () => {
    const store = await open();

    await store.writeItems([anItem("one"), anItem("two")]);
    await store.removeItems(["one"]);

    expect((await store.readItems()).map((item) => item.id)).toEqual(["two"]);
  });

  it("replaces the whole tag list rather than merging it", async () => {
    const store = await open();

    await store.writeTags([aTag("one"), aTag("two")]);
    await store.writeTags([aTag("three")]);

    expect((await store.readTags()).map((use) => use.name)).toEqual(["three"]);
  });

  it("replaces the whole destination list rather than merging it", async () => {
    const store = await open();

    await store.writeDestinations([aDestination("one"), aDestination("two")]);
    await store.writeDestinations([aDestination("three")]);

    expect((await store.readDestinations()).map((held) => held.id)).toEqual([
      "three",
    ]);
  });

  it("reads back the pool identity it was given", async () => {
    const store = await open();

    await store.writePoolIdentity("pool-a");
    await store.writePoolIdentity("pool-b");

    expect(await store.readPoolIdentity()).toBe("pool-b");
  });

  it("answers empty for what it has never been given", async () => {
    const store = await open();

    expect(await store.readOutbox()).toEqual([]);
    expect(await store.readItems()).toEqual([]);
    expect(await store.readTags()).toEqual([]);
    expect(await store.readDestinations()).toEqual([]);
    expect(await store.readPoolIdentity()).toBeUndefined();
    expect(await store.readBlob("asset-1")).toBeUndefined();
  });

  it("reads back a blob under its own name, and forgets a removed one", async () => {
    const store = await open();

    await store.writeBlob("asset-1", aFile());
    const held = await store.readBlob("asset-1");
    expect(await held?.text()).toBe("bytes");
    expect(held?.name).toBe("a photo.png");
    expect(held?.type).toBe("image/png");

    await store.removeBlob("asset-1");
    expect(await store.readBlob("asset-1")).toBeUndefined();
  });

  it("answers one url per blob, and none for bytes it does not hold", async () => {
    const store = await open();
    await store.writeBlob("asset-1", aFile());

    const url = await store.blobUrl("asset-1");
    expect(url).toBeTypeOf("string");
    expect(await store.blobUrl("asset-1")).toBe(url);
    expect(await store.blobUrl("asset-2")).toBeUndefined();
  });
}
