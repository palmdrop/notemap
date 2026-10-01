import { SvelteMap, SvelteSet } from "svelte/reactivity";

/** How long a confirmation holds before it goes. A glance, not a read. */
const LINGERS = 4_000;

/**
 * Long enough to reach for what it offers, or to read what went wrong. Nothing
 * stays longer: the panel is where it is read again.
 */
const OFFERED = 10_000;

/** Enough keys to stop a poll repeating itself, and no memory of the session. */
const REMEMBERED = 200;

/** What the panel can read back. The log is where the rest of it is. */
const KEPT = 100;

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
  /** Something went wrong: drawn in the accent, and counted until the panel is opened. */
  readonly alarm?: boolean;
  /** False where what went wrong is counted where it is held, rather than here. */
  readonly counted?: boolean;
  /** Where to go and look. */
  readonly href?: string;
  readonly offer?: Offer;
  /**
   * What the offer would take back. Taken back some other way — on the row,
   * on the item, on another device — the offer goes, because it would refuse.
   */
  readonly settles?: string;
  /**
   * Said once, however many times it is raised. The pool writes an action for
   * work this shell already reported, and the two arrive as one fact.
   */
  readonly key?: string;
  /**
   * At most one live notice bears a given name, the newest: the last word on
   * one thing takes the place of the words before it.
   */
  readonly only?: string;
  /** When it was said, for the panel to say when. */
  readonly at: number;
};

export type Raised = Omit<Notice, "id" | "at">;

/** A notice as the panel reads it back: still live, or already gone. */
export type Said = Notice & { readonly live: boolean };

let held = $state<Notice[]>([]);
let past = $state<Notice[]>([]);
let minted = 0;

/** Somebody is at the status line, so nothing in it leaves. */
let holding = $state(false);

/** Alarms raised since the panel was last opened. */
let unseen = $state(0);

const spoken = new SvelteSet<string>();
const timers = new SvelteMap<string, ReturnType<typeof setTimeout>>();

function forget(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
}

function lingers(notice: Notice): number {
  return notice.offer === undefined && notice.alarm !== true
    ? LINGERS
    : OFFERED;
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

function remember(key: string): void {
  spoken.add(key);
  if (spoken.size <= REMEMBERED) return;

  const oldest = spoken.values().next();
  if (!oldest.done) spoken.delete(oldest.value);
}

/**
 * What the shell says in its own voice, from the status line. The store is the
 * shell's: nothing here is the pool's record of the same event, which is the
 * action log and outlives whoever was looking.
 */
export const notices = {
  /** Every notice still live, oldest first. */
  get shown(): readonly Notice[] {
    return held;
  },

  /** The one the message line says: the newest still live. */
  get latest(): Notice | undefined {
    return held.at(-1);
  },

  /**
   * Alarms nobody has looked at yet. Nothing has to be cleared, but a failure
   * that lingered and went while nobody was looking is still counted.
   */
  get unseen(): number {
    return unseen;
  },

  /** The panel was opened: whatever went wrong has been seen. */
  seen(): void {
    unseen = 0;
  },

  /** This session's notices, oldest first, live or gone. */
  get history(): readonly Said[] {
    const live = held.map((notice) => notice.id);
    return past.map((notice) => ({
      ...notice,
      live: live.includes(notice.id),
    }));
  },

  /** The id it was given, or nothing where this had already been said. */
  raise(notice: Raised): string | undefined {
    if (notice.key !== undefined) {
      if (spoken.has(notice.key)) return undefined;
      remember(notice.key);
    }

    let kept = held;
    let replaced: readonly Notice[] = [];
    if (notice.only !== undefined) {
      replaced = held.filter((one) => one.only === notice.only);
      for (const gone of replaced) forget(gone.id);
      kept = held.filter((one) => one.only !== notice.only);
    }

    minted += 1;
    const raised: Notice = {
      ...notice,
      id: `notice-${String(minted)}`,
      at: Date.now(),
    };
    held = [...kept, raised];

    // A failure taking the place of a failure is the same thing gone wrong,
    // said again with the last word: read back once, and counted once.
    const restated =
      notice.alarm === true && replaced.some((one) => one.alarm === true);
    const superseded = new Set(
      restated
        ? replaced.filter((one) => one.alarm === true).map((one) => one.id)
        : [],
    );
    past = [...past.filter((one) => !superseded.has(one.id)), raised].slice(
      -KEPT,
    );

    if (notice.alarm === true && notice.counted !== false && !restated) {
      unseen += 1;
    }
    if (!holding) wait(raised);

    return raised.id;
  },

  /** Whether this has been said before, without saying it. */
  said(key: string): boolean {
    return spoken.has(key);
  },

  /** Not the same as being said: a key is remembered so it is not repeated. */
  mark(key: string): void {
    remember(key);
  },

  /**
   * Taking what a notice offered resolves it: what it offered is done. Only a
   * live notice offers anything.
   */
  take(id: string): void {
    const notice = held.find((one) => one.id === id);
    if (notice?.offer === undefined) return;
    notice.offer.take();
    drop(id);
  },

  /** Taken back elsewhere: whatever offered to take it back offers nothing now. */
  settled(what: string): void {
    const spent = (notice: Notice): Notice => {
      if (notice.settles !== what || notice.offer === undefined) return notice;
      const { offer: _gone, ...rest } = notice;
      return rest;
    };
    held = held.map(spent);
    past = past.map(spent);
  },

  /** What has gone is let go of; what is live stays. */
  clearHistory(): void {
    const live = held.map((notice) => notice.id);
    past = past.filter((notice) => live.includes(notice.id));
  },

  /** Under somebody's pointer or focus, nothing leaves. */
  hold(): void {
    holding = true;
    for (const id of [...timers.keys()]) forget(id);
  },

  /** Let go, everything lingers again from the start. */
  release(): void {
    if (!holding) return;
    holding = false;
    for (const notice of held) wait(notice);
  },

  /** Everything, said and remembered: a shut door leaves none of it behind. */
  clear(): void {
    for (const notice of held) forget(notice.id);
    held = [];
    past = [];
    holding = false;
    unseen = 0;
    spoken.clear();
  },
};
