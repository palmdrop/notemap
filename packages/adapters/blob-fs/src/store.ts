import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  BlobHash,
  BlobIntegrity,
  BlobStore,
  StoredBlob,
} from "@notemap/core";

import { pathFor, TEMPORARY_PREFIX } from "./paths";

export type FilesystemBlobConfig = {
  /** The `assets` directory itself. Created as writes land in it. */
  readonly root: string;
};

const ALGORITHM = "sha256";

const CHUNK = 64 * 1024;

export function createFilesystemBlobStore(
  config: FilesystemBlobConfig,
): BlobStore {
  const at = (blob: BlobHash) => pathFor(config.root, blob);

  return {
    /**
     * Hashed on the way to a temporary file, because the name cannot be known
     * until the last byte has been seen. The temporary file sits in the root
     * rather than beside its eventual target for the same reason, and the two
     * are under one directory, so the rename stays within a filesystem.
     */
    put: async (bytes: AsyncIterable<Uint8Array>): Promise<StoredBlob> => {
      await mkdir(config.root, { recursive: true });

      const temporary = join(
        config.root,
        `${TEMPORARY_PREFIX}${randomBytes(8).toString("hex")}`,
      );
      const digest = createHash(ALGORITHM);
      let size = 0;

      try {
        const file = await open(temporary, "wx");
        try {
          for await (const chunk of bytes) {
            digest.update(chunk);
            size += chunk.byteLength;
            await file.write(chunk);
          }
          await file.sync();
        } finally {
          await file.close();
        }

        const hash = digest.digest("hex") as BlobHash;
        const target = at(hash);
        await mkdir(dirname(target), { recursive: true });

        // Bytes that are already there are the same bytes, by construction, so
        // the existing file is left alone rather than rewritten under a reader.
        if (await exists(target)) await unlink(temporary);
        else await rename(temporary, target);

        await syncDirectory(dirname(target));
        return { hash, bytes: size };
      } catch (cause) {
        await unlink(temporary).catch(() => undefined);
        throw cause;
      }
    },

    open: async (blob, signal) => {
      const handle = await openIfPresent(at(blob));
      return handle === undefined ? undefined : chunks(handle, signal);
    },

    verify: async (blob): Promise<BlobIntegrity> => {
      const handle = await openIfPresent(at(blob));
      if (handle === undefined) return "missing";

      const digest = createHash(ALGORITHM);
      for await (const chunk of chunks(handle)) digest.update(chunk);

      return digest.digest("hex") === blob ? "intact" : "drifted";
    },

    delete: async (blob): Promise<void> => {
      await unlink(at(blob)).catch((cause: NodeJS.ErrnoException) => {
        if (cause.code !== "ENOENT") throw cause;
      });
    },

    pathFor: at,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw cause;
  }
}

async function openIfPresent(path: string): Promise<FileHandle | undefined> {
  try {
    return await open(path, "r");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
}

/** A fresh buffer per chunk: a consumer that keeps one must not see it refilled. */
async function* chunks(
  handle: FileHandle,
  signal?: AbortSignal,
): AsyncGenerator<Uint8Array> {
  try {
    for (;;) {
      signal?.throwIfAborted();
      const buffer = new Uint8Array(CHUNK);
      const { bytesRead } = await handle.read(buffer, 0, CHUNK);
      if (bytesRead === 0) return;
      yield buffer.subarray(0, bytesRead);
    }
  } finally {
    await handle.close();
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
