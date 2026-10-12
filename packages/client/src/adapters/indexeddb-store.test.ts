import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { createIndexedDbStore } from "./indexeddb-store";
import {
  aFile,
  anItem,
  anOperation,
  aTag,
  storeContract,
} from "./store-contract.test";

let database = "";
let opened = 0;

beforeEach(() => {
  opened += 1;
  database = `notemap-test-${String(opened)}`;
});

function reopen() {
  return createIndexedDbStore({ database });
}

describe("the IndexedDB store", () => {
  storeContract(() => Promise.resolve(reopen()));

  it("answers from a database the last session wrote", async () => {
    const first = reopen();
    await first.writeOperation(anOperation("a"));
    await first.writeItems([anItem("one")]);
    await first.writeTags([aTag("held")]);
    await first.writePoolIdentity("pool-a");

    const second = reopen();
    expect((await second.readOutbox()).map((held) => held.id)).toEqual(["a"]);
    expect((await second.readItems()).map((item) => item.id)).toEqual(["one"]);
    expect((await second.readTags()).map((use) => use.name)).toEqual(["held"]);
    expect(await second.readPoolIdentity()).toBe("pool-a");
  });

  it("keeps a blob, and its name, across the reopen", async () => {
    await reopen().writeBlob("asset-1", aFile());

    const held = await reopen().readBlob("asset-1");
    expect(await held?.text()).toBe("bytes");
    expect(held?.name).toBe("a photo.png");
  });

  it("forgets what was removed before the reopen", async () => {
    const first = reopen();
    await first.writeItems([anItem("one"), anItem("two")]);
    await first.removeItems(["one"]);
    await first.writeOperation(anOperation("a"));
    await first.removeOperation("a");

    const second = reopen();
    expect((await second.readItems()).map((item) => item.id)).toEqual(["two"]);
    expect(await second.readOutbox()).toEqual([]);
  });

  it("reads a blob a version that recorded no write time wrote, as written long ago", async () => {
    // Version 3 put the `File` itself under the asset's id.
    await new Promise<void>((ok, no) => {
      const ask = indexedDB.open(database, 3);
      ask.onupgradeneeded = () => {
        ask.result.createObjectStore("blobs");
      };
      ask.onsuccess = () => {
        const held = ask.result;
        const tx = held.transaction("blobs", "readwrite");
        tx.objectStore("blobs").put(aFile(), "asset-old");
        tx.oncomplete = () => {
          held.close();
          ok();
        };
        tx.onerror = () => no(tx.error);
      };
      ask.onerror = () => no(ask.error);
    });

    const store = reopen();

    const held = await store.readBlob("asset-old");
    expect(await held?.text()).toBe("bytes");
    expect(held?.name).toBe("a photo.png");
    expect(await store.blobUrl("asset-old")).toBeTypeOf("string");
    expect(await store.blobs()).toEqual([
      { asset: "asset-old", at: "1970-01-01T00:00:00.000Z" },
    ]);
  });

  it("does not open the database until something is asked of it", async () => {
    createIndexedDbStore({ database });

    const names = (await indexedDB.databases()).map((held) => held.name);
    expect(names).not.toContain(database);
  });
});
