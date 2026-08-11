import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  MirrorWriteFailure,
  parseMirrorRecord,
  serialiseMirrorRecord,
  type ItemId,
  type MirrorRecord,
  type MirrorWriter,
} from "@notemap/core";

import { removeIfPresent, TEMPORARY_PREFIX, writeAtomically } from "./atomic";
import {
  FIXED_KEYS,
  fixedFrontmatter,
  toYaml,
  type FrontmatterValue,
} from "./frontmatter";
import { pathsFor, renderingBeside } from "./paths";
import { renderAsJson, type Rendering, type Renderers } from "./renderers";

export type FilesystemMirrorConfig = {
  /** The `pool-mirror` directory itself. Created as writes land in it. */
  readonly root: string;
  /** By payload type. A type with no renderer gets the default rendering. */
  readonly renderers?: Renderers;
};

export function createFilesystemMirrorWriter(
  config: FilesystemMirrorConfig,
): MirrorWriter {
  const renderers = config.renderers ?? {};

  return {
    write: async (record: MirrorRecord): Promise<void> => {
      const paths = pathsFor(config.root, record);

      // Material before presentation: a renderer is host-supplied code, and a
      // bug in it must not keep material out of the mirror.
      await writeAtomically(paths.record, serialiseMirrorRecord(record));
      await writeAtomically(paths.rendering, render(renderers, record));
    },

    /** A bare id cannot give a path, so removal walks the tree instead. */
    remove: async (item: ItemId): Promise<void> => {
      for (const record of await recordsFor(config.root, item)) {
        await removeIfPresent(renderingBeside(record));
        await removeIfPresent(record);
      }
    },
  };
}

function render(renderers: Renderers, record: MirrorRecord): string {
  const renderer = renderers[record.item.payload.type] ?? renderAsJson;

  let rendered: Rendering;
  try {
    rendered = renderer(record);
  } catch (cause) {
    // Non-retryable: it will throw identically on every attempt.
    throw new MirrorWriteFailure(
      "renderer-threw",
      `the renderer for ${record.item.payload.type} threw: ${cause instanceof Error ? cause.message : String(cause)}`,
      false,
      { cause },
    );
  }

  const entries = new Map<string, FrontmatterValue>(fixedFrontmatter(record));
  for (const [key, value] of rendered.frontmatter ?? []) {
    if (!(FIXED_KEYS as readonly string[]).includes(key))
      entries.set(key, value);
  }

  return `${toYaml(entries)}\n${rendered.body}`;
}

/**
 * Every record file in the tree that is about this item, matched on the id
 * inside it. A filename cannot be turned back into an id, and matching on the
 * name alone would delete `a-b`'s files when asked to remove `b`.
 *
 * A file that will not parse is left alone: nothing can say whose it is, and
 * deleting it on suspicion is worse than leaving debris for verify to report.
 */
async function recordsFor(
  root: string,
  item: ItemId,
): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }

  const matched: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    if (entry.name.startsWith(TEMPORARY_PREFIX)) continue;

    const path = join(entry.parentPath, entry.name);
    try {
      if (parseMirrorRecord(await readFile(path, "utf8")).item.id === item) {
        matched.push(path);
      }
    } catch {
      continue;
    }
  }

  return matched;
}
