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
