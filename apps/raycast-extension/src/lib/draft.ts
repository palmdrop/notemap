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

/**
 * `keep` and `drop` never reject: a draft that could not be written is worth
 * a line in the log, not a form that stops answering.
 */
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
 * One write at a time, and only the latest waits behind it: the process ends
 * the moment the form is left, so a queue of every keystroke would lose the
 * newest words first. A drop waiting behind a keep is never overtaken by it.
 */
export function drafts(storage: Storage): Drafts {
  let waiting: (() => Promise<void>) | undefined;
  let writing: Promise<void> | undefined;

  const write = (next: () => Promise<void>): Promise<void> => {
    waiting = next;
    writing ??= (async () => {
      while (waiting !== undefined) {
        const one = waiting;
        waiting = undefined;
        await one().catch((error: unknown) => {
          console.error(error);
        });
      }
      writing = undefined;
    })();
    return writing;
  };

  return {
    read: async () => parsed(await storage.getItem(KEY)),
    keep: (draft) =>
      write(() =>
        isEmpty(draft)
          ? storage.removeItem(KEY)
          : storage.setItem(KEY, JSON.stringify(draft)),
      ),
    drop: () => write(() => storage.removeItem(KEY)),
  };
}
