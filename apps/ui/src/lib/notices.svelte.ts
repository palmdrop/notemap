import { SvelteMap, SvelteSet } from "svelte/reactivity";

/** How long a confirmation holds before it goes. A glance, not a read. */
const LINGERS = 4_000;

/** How many the corner draws at once before it counts the rest instead. */
const SHOWN = 4;

/** Enough keys to stop a poll repeating itself, and no memory of the session. */
const REMEMBERED = 200;

export type Notice = {
  readonly id: string;
  readonly what: string;
  readonly why?: string;
  /** Held until a person clears it: anything they may have to act on. */
  readonly standing?: boolean;
  /** Where to go and look. */
  readonly href?: string;
  /**
   * Said once, however many times it is raised. The pool writes an action for
   * work this shell already reported, and the two arrive as one fact.
   */
  readonly key?: string;
};

type Raised = Omit<Notice, "id">;

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
 * The oldest confirmations go where the corner has run out of room. A standing
 * notice is never one of them: it is there because nothing but a person will
 * resolve it.
 */
function trimmed(notices: Notice[]): Notice[] {
  const kept = [...notices];

  while (kept.length > SHOWN) {
    const at = kept.findIndex((notice) => notice.standing !== true);
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

    minted += 1;
    const id = `notice-${String(minted)}`;
    held = trimmed([...held, { ...notice, id }]);

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

  dismiss(id: string): void {
    drop(id);
  },

  /** For a test, and for a shell that has just been signed out of. */
  clear(): void {
    for (const notice of held) forget(notice.id);
    held = [];
    spoken.clear();
  },
};
