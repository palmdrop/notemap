import { statfs } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * How much room is left where this path lives, for the user the daemon runs as.
 *
 * A root that does not exist yet — a mirror nothing has written to — is asked
 * about through its nearest existing parent, since the answer is about the
 * filesystem rather than the directory. One with no existing parent, or a
 * filesystem that would not say, answers nothing rather than zero: zero is a
 * claim, and a full disk is the one thing it would be read as.
 */
export async function freeAt(path: string): Promise<number | undefined> {
  let at = resolve(path);

  for (;;) {
    try {
      const { bavail, bsize } = await statfs(at);
      return bavail * bsize;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") return undefined;

      const parent = dirname(at);
      if (parent === at) return undefined;
      at = parent;
    }
  }
}
