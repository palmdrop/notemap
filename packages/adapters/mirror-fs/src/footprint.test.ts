import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TEMPORARY_PREFIX } from "./atomic";
import { pathsFor, renderingBeside } from "./paths";
import { destinationRecord, record, root } from "./testing/fixture";
import { createFilesystemMirrorWriter } from "./writer";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function mirror() {
  const opened = root();
  cleanups.push(opened.cleanup);
  return {
    root: opened.path,
    writer: createFilesystemMirrorWriter({ root: opened.path }),
  };
}

describe("how much the mirror says it holds", () => {
  it("answers zeroes for a root nothing has been written to", async () => {
    const { writer } = mirror();

    expect(await writer.footprint()).toEqual({
      records: 0,
      files: 0,
      bytes: 0,
    });
  });

  it("counts the pair each item is, and what the two take", async () => {
    const { writer } = mirror();
    await writer.write(record({ id: "item-1" }));
    await writer.write(
      record({ id: "item-2", createdAt: "2026-08-12T08:00:00.000Z" }),
    );

    const held = await writer.footprint();

    expect(held.records).toBe(2);
    expect(held.files).toBe(4);
    expect(held.bytes).toBeGreaterThan(0);
  });

  /** Nothing else notices a rendering that never landed while verify is unbuilt. */
  it("counts a record whose rendering is missing as one record and one file", async () => {
    const { root: at, writer } = mirror();
    const written = record({ id: "item-1" });
    await writer.write(written);
    await rm(renderingBeside(pathsFor(at, written).record));

    expect(await writer.footprint()).toMatchObject({ records: 1, files: 1 });
  });

  it("ignores a temporary left behind by a killed write", async () => {
    const { root: at, writer } = mirror();
    const written = record({ id: "item-1" });
    await writer.write(written);

    const directory = pathsFor(at, written).directory;
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, `${TEMPORARY_PREFIX}half.json.abc123`),
      "half a write",
    );

    expect(await writer.footprint()).toMatchObject({ records: 1, files: 2 });
  });

  it("counts a destination's record, which has no rendering beside it", async () => {
    const { writer } = mirror();
    await writer.write(destinationRecord());

    expect(await writer.footprint()).toMatchObject({ records: 1, files: 1 });
  });
});
