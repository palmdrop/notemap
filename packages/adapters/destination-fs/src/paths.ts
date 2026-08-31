import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
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
 * A person writes `~/notes` and means their home; a bare `notes` means the
 * directory the daemon happens to have been started in, which is nobody's
 * intent, so it is resolved once here rather than left to the syscall.
 */
export function rootPath(root: string): string {
  const expanded =
    root === "~" || root.startsWith(`~${sep}`) || root.startsWith("~/")
      ? `${homedir()}${root.slice(1)}`
      : root;
  return resolve(expanded);
}

/** Every containment check compares against this: a resolved path against a symlinked root would refuse everything. */
export function realRootOf(root: string): Promise<string> {
  return realpath(rootPath(root));
}

/**
 * The first of `reserved` that `root` contains or sits inside of, resolved the
 * same way a person's setting is — `~` and `..` — but never through a symlink
 * of its own: this is string arithmetic, and how much it catches depends on
 * what its caller hands it. `deliver()` and `candidates()` pass a root already
 * read back through the filesystem; `describe()` touches no filesystem at all,
 * so a root that is a *link* to reserved state passes it and is caught only
 * once something goes and looks.
 */
export function overlapsAny(
  root: string,
  reserved: readonly string[],
): string | undefined {
  const candidate = rootPath(root);
  return reserved.find((each) => overlaps(candidate, rootPath(each)));
}

function overlaps(a: string, b: string): boolean {
  return within(a, b) || within(b, a);
}

/**
 * Where `target` lands under `realRoot`, or a refusal. Two checks, because
 * either alone is a hole: resolving catches an absolute target and any `..`,
 * and reading the path back through the filesystem catches a symlink, which is
 * inside the root by every string test there is.
 */
export async function contain(
  realRoot: string,
  target: string,
): Promise<Containment> {
  const candidate = resolve(realRoot, target);

  if (!within(realRoot, candidate)) {
    return { kind: "refused", detail: `${target} is outside the destination` };
  }

  const deepest = await resolveDeepest(candidate);
  if (deepest.kind === "unusable") {
    return { kind: "refused", detail: "that is not a usable path" };
  }

  const existing = deepest.path;
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

type Deepest =
  | { readonly kind: "resolved"; readonly path: string | undefined }
  /** A path no filesystem will take, such as one carrying a NUL. */
  | { readonly kind: "unusable" };

async function resolveDeepest(path: string): Promise<Deepest> {
  try {
    return { kind: "resolved", path: await deepestExisting(path) };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ERR_INVALID_ARG_VALUE") {
      throw cause;
    }
    return { kind: "unusable" };
  }
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
 * One path segment, from a name that was never promised to be one — an uploaded
 * filename may be `../../authorized_keys`. Letters and digits of any script
 * survive: transliterating would be notemap deciding somebody's language is wrong.
 */
export function oneSegment(name: string, fallback: string): string {
  const flattened = name
    .split(/[/\\]/)
    .join(" ")
    .replace(UNSAFE, "-")
    .slice(0, MAX_SEGMENT);

  // A dash goes with them: every leading character this replaced is one, so a
  // note starting `# heading` would otherwise be filed under `- heading`.
  const trimmed = flattened.replace(/^[-.\s]+/, "").replace(/[-.\s]+$/, "");
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
