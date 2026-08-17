import { realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

/**
 * A path that has been proved to sit under the root, and the same path stated
 * the way a routing record's pointer wants it.
 */
export type Contained = {
  readonly absolute: string;
  /** Relative to the root, in URL separators, so a pointer reads the same everywhere. */
  readonly relative: string;
};

export type Containment =
  | { readonly kind: "contained"; readonly path: Contained }
  | { readonly kind: "refused"; readonly detail: string };

/**
 * The root as the filesystem really holds it. Every containment check compares
 * against this, because comparing a resolved path against a symlinked root
 * would refuse everything.
 */
export function realRootOf(root: string): Promise<string> {
  return realpath(root);
}

/**
 * Where `target` lands under `realRoot`, or a refusal.
 *
 * Two checks, because either alone is a hole. The lexical one resolves the
 * target and compares — an absolute target and any number of `..` segments both
 * land outside and are caught without anything having to recognise them. The
 * second reads the deepest part of the path that exists back through the
 * filesystem, because a symlink is inside the root by every string test there
 * is and points wherever it likes.
 */
export async function contain(
  realRoot: string,
  target: string,
): Promise<Containment> {
  const candidate = resolve(realRoot, target);

  if (!within(realRoot, candidate)) {
    return { kind: "refused", detail: `${target} is outside the destination` };
  }

  let existing: string | undefined;
  try {
    existing = await deepestExisting(candidate);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ERR_INVALID_ARG_VALUE") {
      throw cause;
    }
    // A path no filesystem will take, such as one carrying a NUL. Not echoed
    // back, because the reason it is unusable is the reason it is unprintable.
    return { kind: "refused", detail: "that is not a usable path" };
  }

  if (existing !== undefined && !within(realRoot, existing)) {
    return {
      kind: "refused",
      detail: `${target} leaves the destination through a link`,
    };
  }

  return {
    kind: "contained",
    path: {
      absolute: candidate,
      relative: relative(realRoot, candidate).split(sep).join("/"),
    },
  };
}

/**
 * The root itself counts as contained, because a delivery may legitimately name
 * it as the directory to write into. A *file* that resolves to the root is
 * caught by its empty `relative`, which nothing under the root can have.
 */
function within(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

/**
 * The nearest ancestor of `path` that exists, resolved through every link on
 * the way. Absent only where nothing above it exists either.
 */
async function deepestExisting(path: string): Promise<string | undefined> {
  let current = path;

  while (true) {
    try {
      return await realpath(current);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;

      const parent = dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
}

/** Anything a filename may not hold, on the union of the filesystems that matter. */
const UNSAFE = /[^\p{L}\p{N} ._-]/gu;

const MAX_SEGMENT = 120;

/**
 * One path segment, from a name that was never promised to be one. An asset
 * carries the filename it was uploaded with, which is user data and may be
 * `../../authorized_keys`; a person naming a note may type anything at all.
 *
 * Letters and digits of any script survive, because a filename is the user's
 * and transliterating it would be notemap deciding their language is wrong.
 */
export function oneSegment(name: string, fallback: string): string {
  const flattened = name
    .split(/[/\\]/)
    .join(" ")
    .replace(UNSAFE, "-")
    .slice(0, MAX_SEGMENT);

  const trimmed = flattened.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  return trimmed === "" ? fallback : trimmed;
}

/** `name`, then `name-1`, `name-2`, … keeping the extension where there is one. */
export function* alternatives(name: string, limit = 100): Generator<string> {
  yield name;

  const dot = name.lastIndexOf(".");
  const [stem, extension] =
    dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];

  for (let suffix = 1; suffix < limit; suffix += 1) {
    yield `${stem}-${suffix}${extension}`;
  }
}
