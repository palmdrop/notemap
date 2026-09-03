import { filenameFrom, placeOf } from "@notemap/output-markdown/naming";

import { isFolder, type Level } from "./path-line";

/**
 * What committing the line now would do, read off the vault as it stands. It is
 * **drawn and never stored**: what is stored says *put this here*, and the
 * adapter asks the same question again at delivery, when the answer is true.
 */
export type Forecast = {
  readonly word: "create" | "append";
  /** The note's own name, derived where the path named a folder alone. */
  readonly leaf: string;
  /** Whether that name came from the item rather than from the line. */
  readonly derived: boolean;
  /** Folders along the path that are not there, outermost first. Every one past the first, since nothing under an absent folder is there either. */
  readonly making: readonly string[];
  /**
   * A free name beside the one that is taken, for the person who meant a new
   * note. Absent where nothing is taken, since there is nothing to sit beside.
   */
  readonly beside?: string;
};

export type Said = {
  readonly content: unknown;
  /** What a note is called when the item says nothing nameable. */
  readonly item: string;
};

/**
 * Absent where the destination never answered, or answered only as far as a
 * folder above the one being typed: with nothing to look at there is nothing to
 * forecast, and a word guessed from no evidence is worse than none.
 */
export function forecastOf(
  levels: readonly Level[],
  value: string,
  said: Said,
): Forecast | undefined {
  if (levels[0]?.entries === undefined) return undefined;

  const place = placeOf(value);
  const segments = place.directory === "" ? [] : place.directory.split("/");
  const leaf = place.filename ?? filenameFrom(said.content, said.item);

  // A level that never answered is no evidence either way, and past the first
  // of those there is nothing to say about anything deeper: claiming a folder
  // will be made because the listing has not arrived is a claim on no evidence.
  const making: string[] = [];
  for (const [depth, segment] of segments.entries()) {
    const entries = levels[depth]?.entries;
    if (entries === undefined) return undefined;
    if (!entries.some((entry) => isFolder(entry) && entry.label === segment)) {
      making.push(...segments.slice(depth));
      break;
    }
  }

  // The folder the note lands in is the level past the last segment, which is
  // the one `scopesAlong` asked about last. A folder that is there but has not
  // said what it holds cannot settle the word either.
  const holding = making.length > 0 ? undefined : levels[segments.length];
  if (making.length === 0 && holding?.entries === undefined) return undefined;

  const taken = (holding?.entries ?? []).filter((entry) => !isFolder(entry));
  const there = taken.some((entry) => entry.label === leaf);

  return {
    word: there ? "append" : "create",
    leaf,
    derived: place.filename === undefined,
    making,
    ...(there
      ? { beside: freeName(leaf, new Set(taken.map((each) => each.label))) }
      : {}),
  };
}

/**
 * `decisions.md` taken gives `decisions-1.md`. Suffixed before the extension so
 * the note stays a note, and counted up past every name that is also there.
 */
function freeName(leaf: string, taken: ReadonlySet<string>): string {
  const at = leaf.lastIndexOf(".");
  const stem = at <= 0 ? leaf : leaf.slice(0, at);
  const extension = at <= 0 ? "" : leaf.slice(at);

  for (let next = 1; ; next += 1) {
    const name = `${stem}-${next}${extension}`;
    if (!taken.has(name)) return name;
  }
}
