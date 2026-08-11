import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  asWorkOutcome,
  parseMirrorRecord,
  type ItemId,
  type PayloadTypeName,
} from "@notemap/core";
import { afterEach, describe, expect, it } from "vitest";

import { TEMPORARY_PREFIX } from "./atomic";
import { pathsFor } from "./paths";
import type { Renderer } from "./renderers";
import { root, record, TEXT, at } from "./testing/fixture";
import { createFilesystemMirrorWriter } from "./writer";

const cleanups: (() => void)[] = [];

function mirror(renderers?: Record<string, Renderer>) {
  const opened = root();
  cleanups.push(opened.cleanup);
  return {
    root: opened.path,
    writer: createFilesystemMirrorWriter({
      root: opened.path,
      ...(renderers === undefined ? {} : { renderers }),
    }),
  };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function everyFile(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

function frontmatterOf(rendering: string): string {
  const end = rendering.indexOf("\n---\n", 4);
  if (!rendering.startsWith("---\n") || end === -1) {
    throw new Error(`no frontmatter block in:\n${rendering}`);
  }
  return rendering.slice(4, end + 1);
}

describe("where the pair lands", () => {
  it("puts both halves at the path the item derives", async () => {
    const { root: where, writer } = mirror();
    const written = record({ createdAt: "2026-08-11T14:23:05.000Z" });

    await writer.write(written);

    const paths = pathsFor(where, written);
    expect(paths.record).toBe(
      join(where, "2026", "08", "11", "T142305-text-item-1.json"),
    );
    expect(await everyFile(where)).toEqual([paths.record, paths.rendering]);
  });

  /**
   * The whole naming scheme rests on this: the path comes from the item, in
   * UTC, so two machines in two timezones write the same file.
   */
  it("derives one path however the capture time was spelled", () => {
    const utc = record({ createdAt: "2026-08-11T14:23:05.000Z" });
    const offset = record({ createdAt: "2026-08-11T16:23:05+02:00" });

    expect(pathsFor("/m", offset)).toEqual(pathsFor("/m", utc));
  });

  it("files a late-evening capture under the UTC day", () => {
    const late = record({ createdAt: "2026-08-12T00:30:00+02:00" });

    expect(pathsFor("/m", late).directory).toBe(join("/m", "2026", "08", "11"));
  });

  it("keeps two items apart even when their ids sanitise alike", () => {
    const first = pathsFor("/m", record({ id: "a/b" }));
    const second = pathsFor("/m", record({ id: "a:b" }));

    expect(first.record).not.toBe(second.record);
    expect(first.record).not.toContain("/a/b");
  });

  it("leaves no temporary file behind once a write has landed", async () => {
    const { root: where, writer } = mirror();

    await writer.write(record());

    const names = (await everyFile(where)).map((path) => path.split("/").pop());
    expect(names.some((name) => name?.startsWith(TEMPORARY_PREFIX))).toBe(
      false,
    );
  });
});

describe("rewriting", () => {
  it("replaces the pair in place rather than accumulating", async () => {
    const { root: where, writer } = mirror();

    await writer.write(record({ text: "first" }));
    await writer.write(record({ text: "second", tags: ["kind/quote"] }));

    const files = await everyFile(where);
    expect(files).toHaveLength(2);

    const stored = parseMirrorRecord(
      await readFile(pathsFor(where, record()).record, "utf8"),
    );
    expect(stored.item.payload.content).toEqual({ text: "second" });
    expect(stored.item.tags.map((tag) => tag.name)).toEqual(["kind/quote"]);
  });

  /**
   * What a crash actually leaves: debris beside a complete previous pair, never
   * a truncated file a rebuild would read as authoritative.
   */
  it("leaves the previous pair whole beside a crashed write's debris", async () => {
    const { root: where, writer } = mirror();
    const written = record({ text: "first" });
    await writer.write(written);

    const paths = pathsFor(where, written);
    await mkdir(paths.directory, { recursive: true });
    await writeFile(
      join(paths.directory, `${TEMPORARY_PREFIX}T142305-text-item-1.json.abc`),
      '{"item": tru',
      "utf8",
    );

    const stored = parseMirrorRecord(await readFile(paths.record, "utf8"));
    expect(stored.item.payload.content).toEqual({ text: "first" });
  });
});

describe("the rendering", () => {
  it("gives an unwired payload type provenance and its content", async () => {
    const { root: where, writer } = mirror();
    const written = record({
      tags: ["kind/quote", "project/fiction-a"],
      revisionOf: "item-0",
      contentUpdatedAt: "2026-08-11T15:00:00.000Z",
    });

    await writer.write(written);
    const rendering = await readFile(
      pathsFor(where, written).rendering,
      "utf8",
    );

    expect(frontmatterOf(rendering)).toBe(
      [
        'id: "item-1"',
        'capture_source: "scratchpad"',
        'source_id: "src-1"',
        'payload_type: "text"',
        'captured_at: "2026-08-11T14:23:05.000Z"',
        'wasAttributedTo: "scratchpad"',
        'updated_at: "2026-08-11T15:00:00.000Z"',
        "tags:",
        '  - "kind/quote"',
        '  - "project/fiction-a"',
        'wasRevisionOf: "item-0"',
        "",
      ].join("\n"),
    );
    expect(rendering).toContain('```json\n{\n  "text": "a thought"\n}\n```');
  });

  it("uses a wired renderer's body", async () => {
    const { root: where, writer } = mirror({
      [TEXT]: (written) => ({
        body: `# ${String(written.item.payload.content["text"])}\n`,
      }),
    });

    await writer.write(record({ text: "a thought" }));
    const rendering = await readFile(
      pathsFor(where, record()).rendering,
      "utf8",
    );

    expect(rendering).toContain("# a thought\n");
    expect(rendering).not.toContain("```json");
  });

  it("lets a renderer add frontmatter but never shadow the fixed keys", async () => {
    const { root: where, writer } = mirror({
      [TEXT]: () => ({
        body: "",
        frontmatter: new Map([
          ["title", "mine"],
          ["id", "not-the-item-id"],
        ]),
      }),
    });

    await writer.write(record());
    const block = frontmatterOf(
      await readFile(pathsFor(where, record()).rendering, "utf8"),
    );

    expect(block).toContain('id: "item-1"');
    expect(block).toContain('title: "mine"');
    expect(block).not.toContain("not-the-item-id");
  });

  it("survives a value that would otherwise break the block", async () => {
    const { root: where, writer } = mirror();

    await writer.write(record({ tags: ['a: b #c "d"'] }));
    const block = frontmatterOf(
      await readFile(pathsFor(where, record()).rendering, "utf8"),
    );

    expect(block).toContain('  - "a: b #c \\"d\\""');
  });

  /** The record is already durable by the time a renderer runs, so nothing is lost. */
  it("leaves the record durable when the renderer throws", async () => {
    const { root: where, writer } = mirror({
      [TEXT]: () => {
        throw new Error("no");
      },
    });
    const written = record();

    await expect(writer.write(written)).rejects.toThrow(/renderer for text/);

    const paths = pathsFor(where, written);
    expect(await everyFile(where)).toEqual([paths.record]);
    expect(parseMirrorRecord(await readFile(paths.record, "utf8"))).toEqual(
      written,
    );
  });

  it("reports a throwing renderer as work not worth retrying", async () => {
    const { writer } = mirror({
      [TEXT]: () => {
        throw new Error("no");
      },
    });

    const outcome = await writer.write(record()).catch(asWorkOutcome);

    expect(outcome).toMatchObject({
      kind: "failed",
      retryable: false,
      detail: { code: "renderer-threw" },
    });
  });
});

describe("when the root cannot be written", () => {
  it("reports work that is still owed, so it is tried again", async () => {
    const { root: where, writer } = mirror();
    // A file where the tree should be: every write below it fails.
    await mkdir(join(where, ".."), { recursive: true });
    await writeFile(where, "not a directory", "utf8");

    const outcome = await writer.write(record()).catch(asWorkOutcome);

    expect(outcome).toMatchObject({ kind: "failed", retryable: true });
  });
});

describe("removing", () => {
  it("deletes both halves of the pair", async () => {
    const { root: where, writer } = mirror();
    await writer.write(record());

    await writer.remove("item-1" as ItemId);

    expect(await everyFile(where)).toEqual([]);
  });

  it("leaves other items alone", async () => {
    const { root: where, writer } = mirror();
    await writer.write(record({ id: "item-1" }));
    await writer.write(record({ id: "item-2" }));

    await writer.remove("item-1" as ItemId);

    expect(await everyFile(where)).toEqual([
      pathsFor(where, record({ id: "item-2" })).record,
      pathsFor(where, record({ id: "item-2" })).rendering,
    ]);
  });

  it("is content with files that are already gone", async () => {
    const { writer } = mirror();

    await expect(
      writer.remove("never-written" as ItemId),
    ).resolves.toBeUndefined();
  });

  it("finds a pair whose payload type it was never told", async () => {
    const { root: where, writer } = mirror();
    await writer.write(record({ type: "canvas" as PayloadTypeName }));

    await writer.remove("item-1" as ItemId);

    expect(await everyFile(where)).toEqual([]);
  });
});

describe("the record it writes", () => {
  it("is the canonical serialisation, byte for byte", async () => {
    const { root: where, writer } = mirror();
    const written = record({ createdAt: "2026-08-11T14:23:05Z" });

    await writer.write(written);

    const text = await readFile(pathsFor(where, written).record, "utf8");
    expect(parseMirrorRecord(text)).toEqual(written);
    expect(text.endsWith("\n")).toBe(true);
  });
});

describe("timestamps", () => {
  it("keeps one instant to one spelling in the frontmatter", async () => {
    const { root: where, writer } = mirror();
    const written = record({ createdAt: "2026-08-11T16:23:05+02:00" });

    await writer.write(written);
    const block = frontmatterOf(
      await readFile(pathsFor(where, written).rendering, "utf8"),
    );

    expect(block).toContain('captured_at: "2026-08-11T14:23:05.000Z"');
    expect(at("2026-08-11T14:23:05.000Z")).toBe(written.item.createdAt);
  });
});
