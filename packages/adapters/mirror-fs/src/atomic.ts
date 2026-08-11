import { randomBytes } from "node:crypto";
import { open, mkdir, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** What a crashed write leaves behind, and what verify reports as debris. */
export const TEMPORARY_PREFIX = ".notemap-";

/**
 * Writes `contents` so that a crash leaves either the previous complete file or
 * the new one, never a truncated one a rebuild would read as authoritative.
 *
 * The temporary file goes in the target's own directory, because rename is only
 * atomic within a filesystem and a temp directory may be on another. Both the
 * file and the directory are flushed: rename swaps the entry atomically, but on
 * most filesystems the *directory* is not durable until it is synced, which is
 * the difference between a power cut costing nothing and costing the file.
 */
export async function writeAtomically(
  path: string,
  contents: string,
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });

  const temporary = join(
    directory,
    `${TEMPORARY_PREFIX}${basename(path)}.${randomBytes(6).toString("hex")}`,
  );

  try {
    const file = await open(temporary, "wx");
    try {
      await file.writeFile(contents, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(temporary, path);
  } catch (cause) {
    await unlink(temporary).catch(() => undefined);
    throw cause;
  }

  await syncDirectory(directory);
}

/** Absent already is the outcome asked for, not a failure. */
export async function removeIfPresent(path: string): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw cause;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  let handle;
  try {
    handle = await open(directory, "r");
  } catch {
    // Not every platform lets a directory be opened; the rename still happened.
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
