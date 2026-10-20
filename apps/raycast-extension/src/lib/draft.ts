/** What the capture form holds onto between launches. Attachments are not kept: a path may be gone by then. */
export type Draft = {
  readonly text: string;
  readonly picked: readonly string[];
  readonly typed: string;
};

/** As much of Raycast's `LocalStorage` as a draft needs. */
export type Storage = {
  readonly getItem: (key: string) => Promise<unknown>;
  readonly setItem: (key: string, value: string) => Promise<void>;
  readonly removeItem: (key: string) => Promise<void>;
};

export type Drafts = {
  readonly read: () => Promise<Draft>;
  readonly keep: (draft: Draft) => Promise<void>;
  readonly drop: () => Promise<void>;
};

const KEY = "capture-draft";

export const EMPTY: Draft = { text: "", picked: [], typed: "" };

const isEmpty = (draft: Draft) =>
  draft.text.trim() === "" &&
  draft.picked.length === 0 &&
  draft.typed.trim() === "";

function parsed(stored: unknown): Draft {
  if (typeof stored !== "string") return EMPTY;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null) return EMPTY;
    const { text, picked, typed } = value as Record<string, unknown>;
    return {
      text: typeof text === "string" ? text : "",
      picked: Array.isArray(picked)
        ? picked.filter((tag): tag is string => typeof tag === "string")
        : [],
      typed: typeof typed === "string" ? typed : "",
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Writes go one after another, so a keystroke's write still on its way cannot
 * land after the drop that a capture made.
 */
export function drafts(storage: Storage): Drafts {
  let last: Promise<unknown> = Promise.resolve();
  const after = <T>(next: () => Promise<T>): Promise<T> => {
    const run = last.then(next, next);
    last = run.catch(() => undefined);
    return run;
  };

  return {
    read: () => after(async () => parsed(await storage.getItem(KEY))),
    keep: (draft) =>
      after(() =>
        isEmpty(draft)
          ? storage.removeItem(KEY)
          : storage.setItem(KEY, JSON.stringify(draft)),
      ),
    drop: () => after(() => storage.removeItem(KEY)),
  };
}
