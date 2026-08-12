import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { BlobHash } from "@notemap/core";

import { pathFor } from "./paths";
import { createFilesystemBlobStore } from "./store";
import {
  bytes,
  collect,
  filesUnder,
  root,
  sha256,
  streamOf,
} from "./testing/fixture";

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function store() {
  const opened = root();
  cleanups.push(opened.cleanup);
  return {
    root: opened.path,
    blobs: createFilesystemBlobStore({ root: opened.path }),
  };
}

describe("putting bytes", () => {
  it("names a blob after its own content", async () => {
    const { blobs } = store();
    const content = bytes("a thought");

    const stored = await blobs.put(streamOf(content));

    expect(stored).toEqual({
      hash: sha256(content),
      bytes: content.byteLength,
    });
  });

  it("counts every byte of a stream that arrives in pieces", async () => {
    const { blobs } = store();
    const whole = bytes("one two three");

    const stored = await blobs.put(
      streamOf(bytes("one "), bytes("two "), bytes("three")),
    );

    expect(stored).toEqual({ hash: sha256(whole), bytes: whole.byteLength });
  });

  it("leaves one file when the same content is stored twice", async () => {
    const { root: path, blobs } = store();
    const content = bytes("a thought");

    const first = await blobs.put(streamOf(content));
    const second = await blobs.put(streamOf(content));

    expect(second.hash).toBe(first.hash);
    expect(await filesUnder(path)).toEqual([
      join(first.hash.slice(0, 2), first.hash),
    ]);
  });

  it("does not rewrite bytes that are already there", async () => {
    const { blobs } = store();
    const content = bytes("a thought");

    const { hash } = await blobs.put(streamOf(content));
    // Drift, so a rewrite would be visible as a repair nobody asked for.
    await writeFile(blobs.pathFor(hash), "tampered");
    await blobs.put(streamOf(content));

    expect(await readFile(blobs.pathFor(hash), "utf8")).toBe("tampered");
  });

  it("leaves no blob and no debris when the stream fails partway", async () => {
    const { root: path, blobs } = store();

    async function* failing(): AsyncGenerator<Uint8Array> {
      yield bytes("half a ");
      throw new Error("the client went away");
    }

    await expect(blobs.put(failing())).rejects.toThrow("the client went away");
    expect(await filesUnder(path)).toEqual([]);
  });

  it("stores empty content as a blob like any other", async () => {
    const { blobs } = store();

    const stored = await blobs.put(streamOf());

    expect(stored).toEqual({ hash: sha256(bytes("")), bytes: 0 });
    expect(await collect((await blobs.open(stored.hash))!)).toEqual(bytes(""));
  });
});

describe("opening bytes", () => {
  it("returns exactly what was put, for content that is not text", async () => {
    const { blobs } = store();
    const content = new Uint8Array([0, 1, 2, 0xff, 0xfe, 0x80, 0]);

    const { hash } = await blobs.put(streamOf(content));

    expect(await collect((await blobs.open(hash))!)).toEqual(content);
  });

  it("survives content larger than one read", async () => {
    const { blobs } = store();
    const content = new Uint8Array(200_000).map((_, index) => index % 251);

    const { hash } = await blobs.put(streamOf(content));

    const read = await collect((await blobs.open(hash))!);
    expect(read.byteLength).toBe(content.byteLength);
    expect(read).toEqual(content);
  });

  it("answers nothing for a hash it does not hold", async () => {
    const { blobs } = store();

    expect(await blobs.open(sha256(bytes("never stored")))).toBeUndefined();
  });

  it("stops when the read is aborted", async () => {
    const { blobs } = store();
    const { hash } = await blobs.put(streamOf(new Uint8Array(200_000)));
    const controller = new AbortController();
    controller.abort();

    const stream = await blobs.open(hash, controller.signal);

    await expect(collect(stream!)).rejects.toThrow();
  });
});

describe("verifying", () => {
  it("calls a blob intact when its content still hashes to its name", async () => {
    const { blobs } = store();
    const { hash } = await blobs.put(streamOf(bytes("a thought")));

    expect(await blobs.verify(hash)).toBe("intact");
  });

  it("reports drift after an edit made outside notemap", async () => {
    const { blobs } = store();
    const { hash } = await blobs.put(streamOf(bytes("a thought")));

    await writeFile(blobs.pathFor(hash), "a different thought");

    expect(await blobs.verify(hash)).toBe("drifted");
  });

  it("reports absence after a delete", async () => {
    const { blobs } = store();
    const { hash } = await blobs.put(streamOf(bytes("a thought")));

    await blobs.delete(hash);

    expect(await blobs.verify(hash)).toBe("missing");
  });
});

describe("deleting", () => {
  it("takes the file and leaves the others", async () => {
    const { root: path, blobs } = store();
    const kept = await blobs.put(streamOf(bytes("kept")));
    const gone = await blobs.put(streamOf(bytes("gone")));

    await blobs.delete(gone.hash);

    expect(await filesUnder(path)).toEqual([
      join(kept.hash.slice(0, 2), kept.hash),
    ]);
  });

  it("treats a blob that is already gone as the outcome asked for", async () => {
    const { blobs } = store();
    const { hash } = await blobs.put(streamOf(bytes("a thought")));

    await blobs.delete(hash);

    await expect(blobs.delete(hash)).resolves.toBeUndefined();
  });
});

describe("the layout", () => {
  it("puts a blob where a second process would look for it", () => {
    const { root: path, blobs } = store();
    const hash = sha256(bytes("a thought"));

    expect(blobs.pathFor(hash)).toBe(pathFor(path, hash));
    expect(blobs.pathFor(hash)).toBe(join(path, hash.slice(0, 2), hash));
  });

  it("refuses to name a path for something that is not a hash", () => {
    const { blobs } = store();

    expect(() => blobs.pathFor("../../etc/passwd" as BlobHash)).toThrow(
      /not a blob hash/,
    );
    expect(() => blobs.pathFor("ABC" as BlobHash)).toThrow(/not a blob hash/);
  });
});
