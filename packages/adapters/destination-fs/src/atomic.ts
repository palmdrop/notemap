import { randomBytes } from "node:crypto";
import { link, mkdir, open, rename, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** What a crashed delivery leaves behind, and what nothing here ever adopts. */
export const TEMPORARY_PREFIX = ".notemap-";

/**
 * Creates `path` with these bytes, and fails rather than replacing a file that
 * is there.
 *
 * `link` rather than `rename`, which is what the mirror uses: rename replaces
 * its target silently, and this writes into somebody's own vault. The hard link
 * gives both properties at once — it is refused with `EEXIST` if the name is
 * taken, and the file appears whole or not at all.
 */
export async function createFile(
  path: string,
  contents: string | AsyncIterable<Uint8Array>,
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });

  const temporary = temporaryBeside(path);
  try {
    await write(temporary, contents);
    await link(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }

  await syncDirectory(directory);
}

/**
 * Replaces `path`, which the caller has already decided it owns. A crash leaves
 * the previous complete file or the new one, never a truncated one.
 */
export async function replaceFile(
  path: string,
  contents: string,
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });

  const temporary = temporaryBeside(path);
  try {
    await write(temporary, contents);
    await rename(temporary, path);
  } catch (cause) {
    await unlink(temporary).catch(() => undefined);
    throw cause;
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
  let handle;
  try {
    handle = await open(directory, "r");
  } catch {
    // Not every platform lets a directory be opened; the write still happened.
    return;
  }

  try {
    await handle.sync();
  } catch {
    // Likewise: some filesystems refuse fsync on a directory.
  } finally {
    await handle.close();
  }
}
