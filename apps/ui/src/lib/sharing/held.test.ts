import { File as NodeFile } from "node:buffer";

import { describe, expect, it } from "vitest";

import { holding, posted as form } from "$testing/shares";

import { fold, holdShare, readShares, STALE } from "./held";

const NOW = 10 * STALE;

describe("a share held for the capture page", () => {
  it("is read as its words", async () => {
    const cache = holding();
    await holdShare(
      form({ text: "read this", url: "https://example.org" }),
      cache,
      "1",
    );

    const [share] = await readShares(cache, NOW);

    expect(share?.words).toBe("read this\nhttps://example.org");
    expect(share?.files).toEqual([]);
  });

  it("is read with its files, named and typed as they came, in order", async () => {
    const cache = holding();
    await holdShare(
      form({}, [
        new NodeFile(["first"], "a photo.jpg", { type: "image/jpeg" }),
        new NodeFile(["second"], "notes.pdf", { type: "application/pdf" }),
      ]),
      cache,
      "1",
    );

    const [share] = await readShares(cache, NOW);
    const files = share?.files.map((one) => one.file) ?? [];

    expect(files.map((file) => [file.name, file.type])).toEqual([
      ["a photo.jpg", "image/jpeg"],
      ["notes.pdf", "application/pdf"],
    ]);
    expect(await files[0]?.text()).toBe("first");
  });

  it("does not hold the empty file a share with no file still sends", async () => {
    const cache = holding();
    await holdShare(
      form({ text: "only words" }, [new NodeFile([], "")]),
      cache,
      "1",
    );

    expect((await readShares(cache, NOW))[0]?.files).toEqual([]);
  });

  it("is not let go of by being read", async () => {
    const cache = holding();
    await holdShare(
      form({ text: "once" }, [new NodeFile(["x"], "x.txt")]),
      cache,
      "1",
    );

    await readShares(cache, NOW);

    expect(cache.size()).toBe(2);
  });

  it("once folded, is read with its files and without its words", async () => {
    const cache = holding();
    await holdShare(
      form({ text: "once" }, [new NodeFile(["x"], "x.txt")]),
      cache,
      "1",
    );

    await fold(cache, "1");
    const [share] = await readShares(cache, NOW);

    expect(share?.words).toBeUndefined();
    expect(share?.files.map((one) => one.file.name)).toEqual(["x.txt"]);
  });

  it("once folded with no file left, is let go of", async () => {
    const cache = holding();
    await holdShare(form({ text: "once" }), cache, "1");

    await fold(cache, "1");

    expect(await readShares(cache, NOW)).toEqual([]);
    expect(cache.size()).toBe(0);
  });

  it("reads every share held, oldest first", async () => {
    const cache = holding();
    await holdShare(form({ text: "second" }), cache, "2000-b");
    await holdShare(form({ text: "first" }), cache, "1000-a");

    expect((await readShares(cache, NOW)).map((one) => one.words)).toEqual([
      "first",
      "second",
    ]);
  });

  it("leaves a share whose words have not arrived for the next time", async () => {
    const cache = holding();
    await cache.put(
      `/__shared/${String(NOW - 1000)}-a/file/0`,
      new Response("bytes", { headers: { "x-name": "late.txt" } }),
    );

    expect(await readShares(cache, NOW)).toEqual([]);
    expect(cache.size()).toBe(1);
  });

  it("lets go of a share whose words never arrived", async () => {
    const cache = holding();
    await cache.put(
      `/__shared/${String(NOW - STALE - 1)}-a/file/0`,
      new Response("bytes", { headers: { "x-name": "late.txt" } }),
    );

    expect(await readShares(cache, NOW)).toEqual([]);
    expect(cache.size()).toBe(0);
  });

  it("lets go of a share it cannot read, and reads the ones after it", async () => {
    const cache = holding();
    await cache.put("/__shared/1000-a/words", new Response("not json"));
    await holdShare(form({ text: "after" }), cache, "2000-b");

    const read = await readShares(cache, NOW);

    expect(read.map((one) => one.words)).toEqual(["after"]);
    expect(cache.size()).toBe(1);
  });
});
