import { clip, type Budget } from "@notemap/text";

/** Anything a filename may not hold, on the union of the filesystems that matter. */
const UNSAFE = /[^\p{L}\p{M}\p{N} ._-]/gu;

/** Room under the 255 bytes most filesystems allow for the digest and the `-1` that may follow. */
const SEGMENT: Budget = { characters: 120, bytes: 200 };

/**
 * One path segment, from a name that was never promised to be one — an uploaded
 * filename may be `../../authorized_keys`. Letters and digits of any script
 * survive: transliterating would be notemap deciding somebody's language is wrong.
 */
export function oneSegment(name: string, fallback: string): string {
  const flattened = clip(
    name.normalize("NFC").split(/[/\\]/).join(" ").replace(UNSAFE, "-"),
    SEGMENT,
  );

  // A dash goes with them: every leading character this replaced is one, so a
  // note starting `# heading` would otherwise be filed under `- heading`.
  const trimmed = flattened.replace(/^[-.\s]+/, "").replace(/[-.\s]+$/, "");
  return trimmed === "" ? fallback : trimmed;
}

/**
 * The name `step` places along from `name` when it is taken: `notes.md`, then
 * `notes-1.md`, `notes-2.md`. Suffixed before the extension so a note stays a note.
 */
export function numbered(name: string, step: number): string {
  if (step === 0) return name;
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)}-${step}${name.slice(dot)}`
    : `${name}-${step}`;
}

/** How much of a blob's digest is enough to tell two uploads apart in one folder. */
const DIGEST = 8;

/**
 * What an asset is called beside the note: the name it was uploaded with, with
 * its content's digest before the extension.
 *
 * The digest is what makes a delivery repeatable. A delivery that failed after
 * placing an asset is retried — `unreachable` promises the retry cannot
 * duplicate — and a name derived from the bytes lands on the file the first
 * attempt wrote instead of beside it. The uploaded name stays because a vault
 * full of digests is a vault nobody can read.
 */
export function assetName(
  filename: string,
  blob: string,
  fallback: string,
): string {
  const digest = blob.slice(0, DIGEST);
  const name = oneSegment(filename, fallback);
  const dot = name.lastIndexOf(".");
  const [stem, extension] =
    dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];

  return `${stem}-${digest}${extension}`;
}
