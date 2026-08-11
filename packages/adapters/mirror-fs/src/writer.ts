import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  MirrorWriteFailure,
  serialiseMirrorRecord,
  type ItemId,
  type MirrorRecord,
  type MirrorWriter,
} from "@notemap/core";

import { removeIfPresent, writeAtomically } from "./atomic";
import {
  FIXED_KEYS,
  fixedFrontmatter,
  toYaml,
  type FrontmatterValue,
} from "./frontmatter";
import { pathsFor, stemSuffixFor } from "./paths";
import { renderAsJson, type Renderers } from "./renderers";

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

    /**
     * Given a bare id, because the item may already be purged — which also
     * means the path cannot be computed and the tree has to be searched.
     * Purge is rare; a walk per purge is the price of not making a job carry
     * a snapshot of the item it is about.
     */
    remove: async (item: ItemId): Promise<void> => {
      const suffix = stemSuffixFor(item);
      for (const path of await filesFor(config.root, suffix)) {
        await removeIfPresent(path);
      }
    },
  };
}

function render(renderers: Renderers, record: MirrorRecord): string {
  const renderer = renderers[record.item.payload.type] ?? renderAsJson;

  let rendered;
  try {
    rendered = renderer(record);
  } catch (cause) {
    // Non-retryable: it will throw identically on every attempt, and the
    // record is already durable, so nothing is lost while it is broken.
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

/** Both halves of every pair whose stem ends in this suffix, at any date. */
async function filesFor(
  root: string,
  suffix: string,
): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(`${suffix}.json`) ||
          entry.name.endsWith(`${suffix}.md`)),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}
