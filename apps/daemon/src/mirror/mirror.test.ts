import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseMirrorRecord } from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { daemon, envelope, post, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

function host(mirroring: boolean): Daemon {
  const opened = daemon(undefined, { mirroring });
  open.push(opened);
  return opened;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

async function filesUnder(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

describe("capturing through HTTP, with a mirror wired", () => {
  it("leaves a record and a rendering on disk once the queue drains", async () => {
    const { app, mirrorRoot, drain } = host(true);

    const response = await post(
      app,
      envelope({ text: "the mirror is the point" }),
    );
    expect(response.status).toBe(201);

    expect(await filesUnder(mirrorRoot)).toEqual([]);
    expect(await drain()).toBe(1);

    const files = await filesUnder(mirrorRoot);
    expect(files).toHaveLength(2);

    const record = files.find((path) => path.endsWith(".json"));
    const rendering = files.find((path) => path.endsWith(".md"));
    if (record === undefined || rendering === undefined) {
      throw new Error(`expected a pair, got ${files.join(", ")}`);
    }

    const stored = parseMirrorRecord(await readFile(record, "utf8"));
    if (stored.kind !== "item") throw new Error("expected an item record");
    expect(stored.item.payload.content).toEqual({
      text: "the mirror is the point",
    });
    expect(stored.item.source).toBe("web");

    const text = await readFile(rendering, "utf8");
    expect(text).toContain("capture_source: 'web'");
    expect(text.trimEnd().endsWith("the mirror is the point")).toBe(true);
  });

  it("files the pair under the capture time in UTC", async () => {
    const { app, mirrorRoot, drain } = host(true);
    await post(app, envelope({ capturedAt: "2026-08-11T14:23:05.000Z" }));
    await drain();

    expect(await filesUnder(mirrorRoot)).toEqual([
      join(
        mirrorRoot,
        "2026/08/11/T142305-text-0198f0c2-0000-7000-8000-000000000001.json",
      ),
      join(
        mirrorRoot,
        "2026/08/11/T142305-text-0198f0c2-0000-7000-8000-000000000001.md",
      ),
    ]);
  });

  it("writes each captured item once, and has nothing left to do", async () => {
    const { app, mirrorRoot, drain } = host(true);
    for (const n of [1, 2, 3]) {
      await post(
        app,
        envelope({
          id: `0198f0c2-0000-7000-8000-00000000000${n}`,
          capturedAt: `2026-08-11T09:0${n}:00.000Z`,
        }),
      );
    }

    expect(await drain()).toBe(3);
    expect(await filesUnder(mirrorRoot)).toHaveLength(6);
    expect(await drain()).toBe(0);
  });

  it("rewrites the pair rather than adding one when an item is mirrored again", async () => {
    const { app, mirrorRoot, drain } = host(true);
    await post(app, envelope());
    await drain();

    // A replay of the same capture is not a mutation, so nothing new is owed.
    await post(app, envelope());
    expect(await drain()).toBe(0);
    expect(await filesUnder(mirrorRoot)).toHaveLength(2);
  });
});

describe("capturing through HTTP with no mirror configured", () => {
  it("succeeds, writes nothing, and owes nothing", async () => {
    const { app, mirrorRoot, drain } = host(false);

    const response = await post(app, envelope());

    expect(response.status).toBe(201);
    expect(await drain()).toBe(0);
    expect(await filesUnder(mirrorRoot)).toEqual([]);
  });
});
