import { SvelteMap, SvelteSet } from "svelte/reactivity";

/** How long a confirmation holds before it goes. A glance, not a read. */
const LINGERS = 4_000;

/** Long enough to reach for what it offers; the way back is elsewhere too. */
const OFFERED = 10_000;

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
  /**
   * Whether it is drawn as an alarm. A standing notice is one by default —
   * standing is usually what a failure does — but the two are different facts:
   * a fired template stands because its cancel may not vanish, and nothing has
   * gone wrong.
   */
  readonly alarm?: boolean;
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

/** Somebody is at the corner, so nothing in it leaves or is trimmed away. */
let holding = $state(false);

const spoken = new SvelteSet<string>();
const timers = new SvelteMap<string, ReturnType<typeof setTimeout>>();

function forget(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
}

function lingers(notice: Notice): number {
  return notice.offer === undefined ? LINGERS : OFFERED;
}

function wait(notice: Notice): void {
  forget(notice.id);
  timers.set(
    notice.id,
    setTimeout(() => drop(notice.id), lingers(notice)),
  );
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
    return holding ? held : held.slice(-SHOWN);
  },

  /** Standing notices there was no room for. They are counted, not lost. */
  get folded(): number {
    return holding ? 0 : Math.max(held.length - SHOWN, 0);
  },

  /** The id it was given, or nothing where this had already been said. */
  raise(notice: Raised): string | undefined {
    if (notice.key !== undefined) {
      if (spoken.has(notice.key)) return undefined;
      remember(notice.key);
    }

    let kept = held;
    if (notice.only !== undefined) {
      for (const gone of held) {
        if (gone.only === notice.only) forget(gone.id);
      }
      kept = held.filter((one) => one.only !== notice.only);
    }

    minted += 1;
    const id = `notice-${String(minted)}`;
    const raised = { ...notice, id };
    held = holding ? [...kept, raised] : trimmed([...kept, raised]);

    if (notice.standing !== true && !holding) wait(raised);

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

  /** Under somebody's pointer or focus, nothing in the corner leaves. */
  hold(): void {
    holding = true;
    for (const id of [...timers.keys()]) forget(id);
  },

  /** Let go, the corner is trimmed and everything lingers again from the start. */
  release(): void {
    if (!holding) return;
    holding = false;
    held = trimmed(held);
    for (const notice of held) {
      if (notice.standing !== true) wait(notice);
    }
  },

  /** Everything, said and remembered: a shut door leaves none of it standing. */
  clear(): void {
    for (const notice of held) forget(notice.id);
    held = [];
    holding = false;
    spoken.clear();
  },
};
