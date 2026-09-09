import { SvelteMap } from "svelte/reactivity";

/**
 * What one value of one argument field is called, where the destination has a
 * name for it that the value itself does not carry. An are.na channel is
 * `12345` on a routing template and `Reading` to whoever picked it, and every
 * surface that draws a saved argument wants the second.
 *
 * Kept rather than asked, and kept **across reloads**: the surfaces that need
 * it — a list of templates, a routing record, a row's routing line — draw from
 * pool state and ask no destination anything, and a record read while the
 * account is asleep should still say which channel it went to. So this is a
 * cache with no expiry, and a name in it may be months out of date. That is the
 * trade taken deliberately: a stale title says which channel, and an id says
 * nothing at all.
 *
 * `localStorage` on the same terms as the order and the theme a person picked —
 * presentation, small, and losing it costs an ask. The pool's own mirror is
 * somewhere else entirely and this never goes near it.
 */
const KEY = "notemap:names";

/** Enough for every channel of a busy account, and bounded so it cannot grow forever. */
const KEEP = 500;

export type Named = {
  readonly destination: string;
  readonly capability: string;
  readonly field: string;
  readonly value: string;
};

/** A space between the parts, which none of the four may contain. */
function keyOf(named: Named): string {
  return [named.destination, named.capability, named.field, named.value].join(
    " ",
  );
}

function hydrated(): SvelteMap<string, string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(stored)) return new SvelteMap();

    return new SvelteMap(
      stored.filter(
        (each): each is [string, string] =>
          Array.isArray(each) &&
          typeof each[0] === "string" &&
          typeof each[1] === "string",
      ),
    );
  } catch {
    // Unreadable is empty: this is a cache, and losing it costs an ask.
    return new SvelteMap();
  }
}

/**
 * Reactive per key, which is what lets a row redraw the moment its name lands
 * rather than when something else happens to change.
 */
const held = hydrated();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...held]));
  } catch {
    // A full or refused store is not a reason for a surface to fail to draw.
  }
}

/** The name remembered for this value, where anything ever learned one. */
export function nameFor(named: Named): string | undefined {
  return held.get(keyOf(named));
}

/**
 * Learn one, from whoever came by it — a browse's own page, an ask, or somebody
 * picking it. Re-learning moves it to the newest end, so the names actually
 * being used are the ones that survive the cap.
 */
export function learn(named: Named, label: string): void {
  const key = keyOf(named);
  // Deleted first so re-learning moves it to the newest end rather than
  // leaving it where it was: insertion order is what the cap reads.
  held.delete(key);
  held.set(key, label);

  while (held.size > KEEP) {
    const oldest = held.keys().next();
    if (oldest.done === true) break;
    held.delete(oldest.value);
  }

  persist();
}

/** For tests, which would otherwise carry one case's names into the next. */
export function forgetEveryName(): void {
  held.clear();
  persist();
}
