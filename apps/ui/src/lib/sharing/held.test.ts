import { File as NodeFile } from "node:buffer";

import { describe, expect, it } from "vitest";

import { holding, posted as form } from "$testing/shares";

import { holdShare, takeShares } from "./held";

describe("a share held for the capture page", () => {
  it("is taken as its words", async () => {
    const cache = holding();
    await holdShare(
      form({ text: "read this", url: "https://example.org" }),
      cache,
      "1",
    );

    const taken = await takeShares(cache);

    expect(taken.words).toEqual(["read this\nhttps://example.org"]);
    expect(taken.files).toEqual([]);
  });

  it("is taken with its files, named and typed as they came, in order", async () => {
    const cache = holding();
    await holdShare(
      form({}, [
        new NodeFile(["first"], "a photo.jpg", { type: "image/jpeg" }),
        new NodeFile(["second"], "notes.pdf", { type: "application/pdf" }),
      ]),
      cache,
      "1",
    );

    const { words, files } = await takeShares(cache);

    expect(words).toEqual([]);
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

    expect((await takeShares(cache)).files).toEqual([]);
  });

  it("is let go of once taken", async () => {
    const cache = holding();
    await holdShare(
      form({ text: "once" }, [new NodeFile(["x"], "x.txt")]),
      cache,
      "1",
    );

    await takeShares(cache);

    expect(cache.size()).toBe(0);
    expect(await takeShares(cache)).toEqual({ words: [], files: [] });
  });

  it("takes every share held, oldest first", async () => {
    const cache = holding();
    await holdShare(form({ text: "second" }), cache, "2000-b");
    await holdShare(form({ text: "first" }), cache, "1000-a");

    expect((await takeShares(cache)).words).toEqual(["first", "second"]);
  });

  it("leaves a share whose words have not arrived for the next time", async () => {
    const cache = holding();
    await cache.put(
      "/__shared/1/file/0",
      new Response("bytes", { headers: { "x-name": "late.txt" } }),
    );

    expect(await takeShares(cache)).toEqual({ words: [], files: [] });
    expect(cache.size()).toBe(1);
  });
});
