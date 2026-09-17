import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Unreadable } from "../errors";
import { createFilesystemStore } from "./filesystem-store";
import {
  aFile,
  anItem,
  anOperation,
  aTag,
  storeContract,
} from "./store-contract.test";

let directory = "";
const onError = vi.fn();

beforeEach(async () => {
  onError.mockReset();
  directory = await mkdtemp(join(tmpdir(), "notemap-store-"));
});

afterEach(() => rm(directory, { recursive: true, force: true }));

function reopen() {
  return createFilesystemStore(directory, { onError });
}

async function plant(name: string, contents: string) {
  const path = join(directory, name);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, contents);
}

describe("the filesystem store", () => {
  storeContract(() => Promise.resolve(reopen()));

  it("answers from a directory the last store wrote", async () => {
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
    expect(held?.type).toBe("image/png");
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

  it("answers a file url for a blob it holds", async () => {
    await reopen().writeBlob("asset-1", aFile());

    expect(await reopen().blobUrl("asset-1")).toMatch(/^file:\/\/.*asset-1/);
  });

  it("creates the directory on the first write, not before", async () => {
    await rm(directory, { recursive: true });
    const store = reopen();

    await expect(readdir(directory)).rejects.toThrow();
    expect(await store.readOutbox()).toEqual([]);
    await expect(readdir(directory)).rejects.toThrow();

    await store.writeOperation(anOperation("a"));
    expect(await readdir(join(directory, "outbox"))).toEqual(["a.json"]);
  });

  it("leaves nothing behind but the file it wrote", async () => {
    const store = reopen();
    await store.writeTags([aTag("one")]);
    await store.writeTags([aTag("two")]);
    await store.writeOperation(anOperation("a"));

    expect(await readdir(directory)).toEqual(["outbox", "tags.json"]);
    expect(await readdir(join(directory, "outbox"))).toEqual(["a.json"]);
  });

  it("never reads a file another write has not finished", async () => {
    const store = reopen();
    await store.writeTags([aTag("one")]);
    await store.writeOperation(anOperation("a"));
    await plant("tags.json.0000.tmp", '[{"name":"tw');
    await plant("outbox/b.json.0000.tmp", '{"id":"b","op');

    expect((await store.readTags()).map((use) => use.name)).toEqual(["one"]);
    expect((await store.readOutbox()).map((held) => held.id)).toEqual(["a"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports an operation it cannot parse, sets it aside, and keeps the rest", async () => {
    const store = reopen();
    await store.writeOperation(anOperation("a"));
    await plant("outbox/b.json", "{not json");

    expect((await store.readOutbox()).map((held) => held.id)).toEqual(["a"]);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Unreadable);
    expect((await readdir(join(directory, "outbox"))).sort()).toEqual([
      "a.json",
      "b.unreadable",
    ]);

    onError.mockReset();
    expect((await store.readOutbox()).map((held) => held.id)).toEqual(["a"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("answers empty for a collection it cannot parse, and says so", async () => {
    await plant("items.json", "[{");
    await plant("pool.json", "");

    const store = reopen();
    expect(await store.readItems()).toEqual([]);
    expect(await store.readPoolIdentity()).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("answers no blob for bytes with no record beside them", async () => {
    await plant("blobs/asset-1/bytes", "bytes");

    const store = reopen();
    expect(await store.readBlob("asset-1")).toBeUndefined();
    expect(await store.blobUrl("asset-1")).toBeUndefined();
  });

  it("keeps every item written from racing writers in one process", async () => {
    const store = reopen();
    await Promise.all([
      store.writeItems([anItem("one")]),
      store.writeItems([anItem("two")]),
      store.removeItems(["one"]),
      store.writeItems([anItem("three")]),
    ]);

    expect((await store.readItems()).map((item) => item.id).sort()).toEqual([
      "three",
      "two",
    ]);
  });
});
