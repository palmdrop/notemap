import { randomBytes } from "node:crypto";
import {
  link,
  mkdir,
  open,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { Contended } from "./errors";

/** What a crashed delivery leaves behind, and what nothing here ever adopts. */
export const TEMPORARY_PREFIX = ".notemap-";

/** `link` rather than `rename`: rename replaces its target silently, and this is somebody's own vault. */
export function createFile(
  path: string,
  contents: string | AsyncIterable<Uint8Array>,
): Promise<void> {
  return throughTemporary(path, contents, link);
}

/** What a file was when it was read, which is how a later write tells whether anyone wrote it since. */
export type Snapshot = { readonly mtimeMs: number; readonly size: number };

/** The file and what it was as it was read, from one open handle; absent where there is no file. */
export async function readWithSnapshot(
  path: string,
): Promise<{ text: string; snapshot: Snapshot } | undefined> {
  const file = await open(path, "r").catch((cause: unknown) => {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  });
  if (file === undefined) return undefined;

  try {
    const { mtimeMs, size } = await file.stat();
    return { text: await file.readFile("utf8"), snapshot: { mtimeMs, size } };
  } finally {
    await file.close();
  }
}

/**
 * Replaces `path`, which the caller read as `read`. Renaming over a symlink
 * would replace the link rather than write through it, so the target is
 * resolved first and the real file is what gets replaced.
 *
 * Refuses as `Contended` where the file is no longer what was read: somebody
 * else wrote it in between, and replacing it would throw their edit away. An
 * edit landing between the check and the rename, or one that keeps both the
 * size and a coarse filesystem's timestamp, still gets past.
 */
export async function replaceFile(
  path: string,
  contents: string,
  read: Snapshot,
  called: string,
): Promise<void> {
  const real = await realpath(path).catch(() => path);
  return throughTemporary(real, contents, async (temporary, to) => {
    if (!(await unchanged(to, read))) {
      throw new Contended(`${called} changed after it was read`);
    }
    await rename(temporary, to);
  });
}

async function unchanged(path: string, read: Snapshot): Promise<boolean> {
  const now = await stat(path).catch(() => undefined);
  return now?.mtimeMs === read.mtimeMs && now.size === read.size;
}

/**
 * Written beside its target and put in place by one call, so a crash leaves the
 * previous file or the new one and never a half-written one. The temporary is
 * removed whichever way that call goes.
 */
async function throughTemporary(
  path: string,
  contents: string | AsyncIterable<Uint8Array>,
  place: (temporary: string, to: string) => Promise<void>,
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });

  const temporary = temporaryBeside(path);
  try {
    await write(temporary, contents);
    await place(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }

  await syncDirectory(directory);
}

/** The temporary file goes in the target's own directory: a link is only possible within a filesystem. */
function temporaryBeside(path: string): string {
  return join(
    dirname(path),
    `${TEMPORARY_PREFIX}${basename(path)}.${randomBytes(6).toString("hex")}`,
  );
}

async function write(
  path: string,
  contents: string | AsyncIterable<Uint8Array>,
): Promise<void> {
  const file = await open(path, "wx");
  try {
    if (typeof contents === "string") await file.writeFile(contents, "utf8");
    else await drain(file, contents);
    await file.sync();
  } finally {
    await file.close();
  }
}

/** Chunk by chunk: a delivery may be carrying an hour of audio. */
async function drain(
  file: FileHandle,
  contents: AsyncIterable<Uint8Array>,
): Promise<void> {
  for await (const chunk of contents) await file.write(chunk);
}

async function syncDirectory(directory: string): Promise<void> {
  // Not every platform lets a directory be opened, and some refuse fsync on
  // one; the write has still happened either way.
  const handle = await open(directory, "r").catch(() => undefined);
  if (handle === undefined) return;

  try {
    await handle.sync().catch(() => undefined);
  } finally {
    await handle.close();
  }
}
