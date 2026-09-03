import type { CandidateEntry, RememberedPlace } from "@notemap/client";

/**
 * A typed path, split where the line reads it. Everything before the last slash
 * is settled and names a scope to ask about; what follows it is being typed and
 * is what filters that scope's entries.
 */
export type TypedPath = {
  readonly complete: readonly string[];
  readonly typing: string;
  /** The path names a folder: it ends in a slash, or holds nothing at all. */
  readonly folder: boolean;
};

export function parsePath(value: string): TypedPath {
  const at = value.lastIndexOf("/");
  const head = at < 0 ? "" : value.slice(0, at);
  const typing = at < 0 ? value : value.slice(at + 1);

  return {
    complete: head.split("/").filter((segment) => segment !== ""),
    typing,
    folder: typing === "",
  };
}

/**
 * Every scope along the path, outermost first, one per level the tree draws —
 * the root, then each complete segment in turn. The last is the one whose
 * entries the typed text filters.
 */
export function scopesAlong(path: TypedPath): readonly string[] {
  return [
    "",
    ...path.complete.map((_, at) => path.complete.slice(0, at + 1).join("/")),
  ];
}

/**
 * What one scope answered, held by index against `scopesAlong`. A scope with no
 * entries is a folder that is not there yet, which is an ordinary state of a
 * path being typed and not a failure of anything.
 */
export type Level = {
  readonly scope: string;
  readonly entries?: readonly CandidateEntry[];
  readonly truncated?: boolean;
  /** Why it answered nothing. At the root that is the destination refusing; deeper it is a folder that is not there. */
  readonly refusal?: string;
  /** What the destination said, kept where a hover reaches it rather than spent on a line. */
  readonly why?: string;
};

/** A folder is anywhere there is more to look at, whether or not it may be taken. */
export function isFolder(entry: CandidateEntry): boolean {
  return entry.scope !== undefined;
}

/** What an entry adds to the line: a folder carries its own slash, so typing continues. */
export function textOf(entry: CandidateEntry): string {
  return isFolder(entry) ? `${entry.label}/` : entry.label;
}

/**
 * The whole line a listed entry names, rather than a name to append to what was
 * typed. An entry carries its own path from the destination's root, and the
 * tree draws every level at once — so taking one three levels up drills the
 * line down to exactly that folder, which is what pointing at it means. A
 * folder keeps its slash, so typing simply continues inside it.
 */
export function pathOf(entry: CandidateEntry): string {
  if (entry.scope !== undefined) return `${entry.scope}/`;
  if (entry.value === undefined) return entry.label;
  return String(entry.value);
}

/** Case-insensitively, and by prefix rather than substring: this completes a name being typed. */
export function matching(
  entries: readonly CandidateEntry[],
  typing: string,
): readonly CandidateEntry[] {
  const wanted = typing.toLowerCase();
  return entries.filter((entry) =>
    entry.label.toLowerCase().startsWith(wanted),
  );
}

/** One line of the drawn hierarchy. */
export type Row = {
  readonly entry: CandidateEntry;
  readonly depth: number;
  /** The segment the typed path took at this level, so the trail reads down the tree. */
  readonly onPath: boolean;
  /** Not there yet: typed, and about to be made by the delivery. Never takeable. */
  readonly made?: boolean;
};

/**
 * Which level the typed text filters: the one whose scope is the settled part
 * of the path, and no other. Not the deepest that *answered* — inside a folder
 * that is not there yet, that is the folder above, and matching a half-typed
 * note against its contents empties the trail exactly where the context is
 * needed most.
 */
export function filtered(path: TypedPath): number {
  return path.complete.length;
}

/**
 * The hierarchy as it is drawn: each level's entries under the ancestor the
 * path took, rather than one level's whole listing after another's. Every level
 * shows its siblings, which is what makes the tree *shown* rather than walked;
 * only the level the caret is in is filtered by what is being typed.
 */
export function rowsOf(
  levels: readonly Level[],
  path: TypedPath,
): readonly Row[] {
  const here = filtered(path);
  const rows: Row[] = [];

  const walk = (depth: number): void => {
    const level = levels[depth];
    if (level?.entries === undefined) return;

    const deepest = depth === here;
    const entries = deepest
      ? matching(level.entries, path.typing)
      : level.entries;
    const onward = path.complete[depth];

    for (const entry of entries) {
      const onPath = !deepest && entry.label === onward;
      rows.push({ entry, depth, onPath });
      if (onPath) walk(depth + 1);
    }
  };

  walk(0);
  return rows;
}

/** What the caret is in, which is what `⇥` completes from and what says it was cut short. */
export function levelAt(
  levels: readonly Level[],
  path: TypedPath,
): Level | undefined {
  return levels[filtered(path)];
}

/**
 * The tail of the typed path that is not there yet, drawn where it will be
 * rather than named off to one side: the folders still to be made, indented
 * under the deepest one that exists, and the note itself under those. It is
 * what the design draws with a `+`, and it is the same forecast the status word
 * is read from — this only puts it where the eye already is.
 */
export function pending(
  path: TypedPath,
  making: readonly string[],
  leaf: string,
): readonly Row[] {
  const from = path.complete.length - making.length;
  const settled = path.complete.slice(0, from);

  return [...making, leaf].map((label, at) => {
    const folder = at < making.length;
    // The scope it would have, so it reads as a folder and indents like one.
    const scope = [...settled, ...making.slice(0, at + 1)].join("/");

    return {
      entry: folder ? { label, scope } : { label },
      depth: from + at,
      onPath: folder,
      made: true,
    };
  });
}

/**
 * The rows `↑↓` moves through: every one that can be taken, which is every one
 * drawn but the folders still to be made. The tree is shown rather than walked,
 * so a folder two levels up is as takeable as a sibling at the caret — and the
 * keyboard reaching less than the pointer does would be the pointer's tree and
 * the keyboard's being two different trees.
 */
export function reachable(rows: readonly Row[]): readonly Row[] {
  return rows.filter((row) => row.made !== true);
}

/**
 * What `⇥` puts in place of what is being typed. One match completes to the
 * whole name; several complete only as far as they agree, which is the shell
 * behaviour this borrows and is why a common prefix is worth extending to at
 * all. Nothing to add answers undefined, so the key does nothing visible rather
 * than something surprising.
 */
export function completionOf(
  entries: readonly CandidateEntry[],
  typing: string,
): string | undefined {
  const hits = matching(entries, typing);
  if (hits.length === 0) return undefined;

  if (hits.length === 1) {
    const only = textOf(hits[0] as CandidateEntry);
    return only === typing ? undefined : only;
  }

  const shared = commonPrefix(hits.map((entry) => entry.label));
  return shared.length > typing.length ? shared : undefined;
}

function commonPrefix(labels: readonly string[]): string {
  const [first = "", ...rest] = labels;

  let length = first.length;
  for (const label of rest) {
    while (
      length > 0 &&
      label.slice(0, length).toLowerCase() !==
        first.slice(0, length).toLowerCase()
    ) {
      length -= 1;
    }
  }

  return first.slice(0, length);
}

/**
 * What `⌫` leaves when it is pressed at the head of a segment: the level above.
 * Deleting one character there would join two names into one that was never
 * typed, so the whole segment goes.
 */
export function popped(value: string): string {
  const path = parsePath(value);
  if (path.complete.length === 0) return "";

  const head = path.complete.slice(0, -1).join("/");
  return head === "" ? "" : `${head}/`;
}

/** Replacing what is being typed, keeping everything settled before it. */
export function withTyping(path: TypedPath, typing: string): string {
  const head = path.complete.join("/");
  return head === "" ? typing : `${head}/${typing}`;
}

/**
 * A place from the pool's own records, beside what the destination offers.
 * `gone` where the listing was answered and does not hold it — a folder routed
 * to twelve times and now absent is not a new folder somebody meant to make,
 * it is a sign the vault was restructured, and this is the last moment anything
 * can say so.
 */
export type Remembered = RememberedPlace & { readonly gone: boolean };

/**
 * Most used first, then most recent. Ranking is the shell's, because the pool
 * answers facts: changing this is a change here and not on the wire.
 */
export function ranked(places: readonly Remembered[]): readonly Remembered[] {
  return [...places].sort(
    (a, b) =>
      b.uses - a.uses ||
      Date.parse(b.lastAt) - Date.parse(a.lastAt) ||
      a.value.localeCompare(b.value),
  );
}

/**
 * Whether a remembered place is still there, checked against the level whose
 * scope holds it. **Only where that level answered**: against an unreachable
 * destination there is nothing to check, and claiming a place is gone on no
 * evidence is worse than making no claim.
 */
export function marked(
  places: readonly RememberedPlace[],
  levels: readonly Level[],
): readonly Remembered[] {
  return places.map((place) => ({
    ...place,
    gone: absent(place.value, levels),
  }));
}

/**
 * Walked from the root rather than checked at the leaf: the root is the one
 * scope always asked about, so a top-level folder that has vanished is the case
 * this can always see — and it is the motivating one. Past the last level that
 * answered there is no evidence, and no claim is made.
 */
function absent(value: string, levels: readonly Level[]): boolean {
  const segments = value.split("/").filter((segment) => segment !== "");

  for (const [depth, segment] of segments.entries()) {
    const holding = levels.find(
      (level) => level.scope === segments.slice(0, depth).join("/"),
    );
    if (holding?.entries === undefined) return false;
    if (!holding.entries.some((entry) => entry.label === segment)) return true;
  }

  return false;
}

/**
 * The greyed continuation after the caret: the best remembered place the line
 * is a prefix of, as the text still to come. A `gone` place is **never** it —
 * the ghost is the thing a person takes without reading, and a discrepancy has
 * to be looked at, so it stays in the list where `↑↓` reaches it deliberately.
 */
export function ghostFor(
  value: string,
  places: readonly Remembered[],
): string | undefined {
  return continuationOf(value, places)?.slice(value.length);
}

/**
 * The whole line `→` leaves behind. **Case-sensitively**, unlike the list
 * beneath it: the ghost is drawn as the text still to come, so a prefix that
 * only matches when case is ignored would draw `Projects/` over a `projects/`
 * that is what taking it would write. The list stays case-insensitive, where
 * `↑↓` reaches the place and replaces the line outright.
 */
export function continuationOf(
  value: string,
  places: readonly Remembered[],
): string | undefined {
  if (value === "") return undefined;

  return ranked(places).find(
    (place) =>
      !place.gone &&
      place.value.length > value.length &&
      place.value.startsWith(value),
  )?.value;
}

/** Remembered places the whole typed line is still a prefix of. */
export function continuing(
  value: string,
  places: readonly Remembered[],
): readonly Remembered[] {
  const wanted = value.toLowerCase();
  return ranked(places).filter((place) =>
    place.value.toLowerCase().startsWith(wanted),
  );
}
