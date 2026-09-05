import { SvelteMap, SvelteSet } from "svelte/reactivity";

/** How long a confirmation holds before it goes. A glance, not a read. */
const LINGERS = 4_000;

/** How many the corner draws at once before it counts the rest instead. */
const SHOWN = 4;

/** Enough keys to stop a poll repeating itself, and no memory of the session. */
const REMEMBERED = 200;

/** Something to do about it, here, rather than somewhere to go and look. */
export type Offer = {
  readonly label: string;
  readonly take: () => void;
};

export type Notice = {
  readonly id: string;
  readonly what: string;
  readonly why?: string;
  /** Which capture it was about: its stamp and its own first words. */
  readonly about?: string;
  /** Held until a person clears it: anything they may have to act on. */
  readonly standing?: boolean;
  /** Where to go and look. */
  readonly href?: string;
  readonly offer?: Offer;
  /**
   * Said once, however many times it is raised. The pool writes an action for
   * work this shell already reported, and the two arrive as one fact.
   */
  readonly key?: string;
  /**
   * At most one notice bears a given name, the newest. An offer nobody can
   * make twice is the case for it: a corner stacking four of them while a
   * queue is worked is not the quiet thing it is meant to be.
   */
  readonly only?: string;
};

export type Raised = Omit<Notice, "id">;

let held = $state<Notice[]>([]);
let minted = 0;

const spoken = new SvelteSet<string>();
const timers = new SvelteMap<string, ReturnType<typeof setTimeout>>();

function forget(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
}

function drop(id: string): void {
  forget(id);
  held = held.filter((notice) => notice.id !== id);
}

/**
 * The oldest confirmations go where the corner has run out of room. Two are
 * never among them: a standing notice, which is there because nothing but a
 * person will resolve it, and the one just raised — a corner full of failures
 * would otherwise swallow the confirmation of what somebody has this second
 * done, which is the one they are waiting for. What there is still no room for
 * is counted rather than dropped.
 */
function trimmed(notices: Notice[]): Notice[] {
  const kept = [...notices];

  while (kept.length > SHOWN) {
    const at = kept
      .slice(0, -1)
      .findIndex((notice) => notice.standing !== true);
    if (at === -1) return kept;

    const [gone] = kept.splice(at, 1);
    if (gone !== undefined) forget(gone.id);
  }

  return kept;
}

function remember(key: string): void {
  spoken.add(key);
  if (spoken.size <= REMEMBERED) return;

  const oldest = spoken.values().next();
  if (!oldest.done) spoken.delete(oldest.value);
}

/**
 * What the shell says in its own voice, in the corner it already speaks from.
 * The store is the shell's: nothing here is the pool's record of the same
 * event, which is the action log and outlives whoever was looking.
 */
export const notices = {
  /** Oldest first, so the newest sits nearest the corner it is drawn in. */
  get shown(): readonly Notice[] {
    return held.slice(-SHOWN);
  },

  /** Standing notices there was no room for. They are counted, not lost. */
  get folded(): number {
    return Math.max(held.length - SHOWN, 0);
  },

  /** The id it was given, or nothing where this had already been said. */
  raise(notice: Raised): string | undefined {
    if (notice.key !== undefined) {
      if (spoken.has(notice.key)) return undefined;
      remember(notice.key);
    }

    let standing = held;
    if (notice.only !== undefined) {
      for (const gone of held) {
        if (gone.only === notice.only) forget(gone.id);
      }
      standing = held.filter((one) => one.only !== notice.only);
    }

    minted += 1;
    const id = `notice-${String(minted)}`;
    held = trimmed([...standing, { ...notice, id }]);

    if (notice.standing !== true) {
      timers.set(
        id,
        setTimeout(() => drop(id), LINGERS),
      );
    }

    return id;
  },

  /** Whether this has been said before, without saying it. */
  said(key: string): boolean {
    return spoken.has(key);
  },

  /** Not the same as being said: a key is remembered so it is not repeated. */
  mark(key: string): void {
    remember(key);
  },

  /** Taking what a notice offered resolves it: the thing it was standing for is done. */
  take(id: string): void {
    const notice = held.find((one) => one.id === id);
    if (notice?.offer === undefined) return;
    notice.offer.take();
    drop(id);
  },

  dismiss(id: string): void {
    drop(id);
  },

  /** Everything, said and remembered: a shut door leaves none of it standing. */
  clear(): void {
    for (const notice of held) forget(notice.id);
    held = [];
    spoken.clear();
  },
};
