/**
 * A path that has been proved to sit under the destination's own collection,
 * and the same path stated the way a routing record's pointer wants it.
 */
export type Contained = {
  /** Every segment percent-encoded, ready to be appended to the account's base URL. */
  readonly encoded: string;
  /** Relative to the destination's root, in URL separators, so a pointer reads the same as the filesystem kind's. */
  readonly relative: string;
  /** The whole path from the account's own collection, undecorated. */
  readonly segments: readonly string[];
  /** How many of those segments are the root's, which is where the destination starts. */
  readonly rootDepth: number;
};

export type Containment =
  | { readonly kind: "contained"; readonly path: Contained }
  | { readonly kind: "refused"; readonly detail: string };

/**
 * Containment here is string arithmetic and nothing else: there are no links to
 * chase, so the filesystem kind's second check — reading the path back through
 * what it names — has no counterpart and none is needed. What replaces it is
 * that a resolved path is only ever reassembled one encoded segment at a time,
 * so nothing a segment can hold — `..`, `/`, `:` and `?` included — can make
 * the result address anything the base URL does not contain.
 */
export function contain(root: string, target: string): Containment {
  const outside: Containment = {
    kind: "refused",
    detail: `${target} is outside the destination`,
  };

  if (target.startsWith("/")) return outside;

  const from = resolve(segmentsOf(root));
  const to = resolve([...segmentsOf(root), ...segmentsOf(target)]);
  if (from === undefined || to === undefined) return outside;
  if (!startsWith(to, from)) return outside;

  return {
    kind: "contained",
    path: {
      encoded: encodePath(to),
      relative: to.slice(from.length).join("/"),
      segments: to,
      rootDepth: from.length,
    },
  };
}

export function encodePath(segments: readonly string[]): string {
  return segments.map(encodeURIComponent).join("/");
}

/**
 * The collections between the destination's root and `path`, outermost first —
 * the ones a `PUT` needs and will not make for itself. The root is not among
 * them: one that is not there is an account or a vault somebody has not made,
 * which is the shape of thing to report rather than to conjure.
 */
export function collectionsUnder(path: Contained): readonly string[] {
  const collections: string[] = [];

  for (
    let depth = path.rootDepth + 1;
    depth < path.segments.length;
    depth += 1
  ) {
    collections.push(encodePath(path.segments.slice(0, depth)));
  }

  return collections;
}

/** The collection a file sits in, which is where its assets go too. */
export function collectionOf(path: Contained): string {
  return encodePath(path.segments.slice(0, -1));
}

/** `a//b/` and `a/b` are one path. An empty target names the collection it was resolved against. */
function segmentsOf(path: string): readonly string[] {
  return path.split("/").filter((segment) => segment !== "");
}

/** Absent where the path climbs above where it started. */
function resolve(segments: readonly string[]): readonly string[] | undefined {
  const stack: string[] = [];

  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) return undefined;
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  return stack;
}

function startsWith(
  path: readonly string[],
  prefix: readonly string[],
): boolean {
  return (
    path.length >= prefix.length &&
    prefix.every((segment, index) => path[index] === segment)
  );
}

/** The same collection, a different name in it — a suffixed note, or an asset beside one. */
export function sibling(path: Contained, name: string): Contained {
  const segments = [...path.segments.slice(0, -1), name];

  return {
    encoded: encodePath(segments),
    relative: segments.slice(path.rootDepth).join("/"),
    segments,
    rootDepth: path.rootDepth,
  };
}
