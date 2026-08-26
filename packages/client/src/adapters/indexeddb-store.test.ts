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

  it("does not open the database until something is asked of it", async () => {
    createIndexedDbStore({ database });

    const names = (await indexedDB.databases()).map((held) => held.name);
    expect(names).not.toContain(database);
  });
});
