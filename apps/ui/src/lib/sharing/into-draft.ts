import { onFilesHeld, restoreDraft, type Restored } from "$lib/draft";

import { fold, readShares, SHARES, type Holding } from "./held";

/** Each shared file the draft holds in this page, and where the worker's cache keeps it. */
const kept = new Map<File, string>();

/** The worker's cache, or nothing where this browser keeps none. */
async function shares(): Promise<Holding | undefined> {
  return typeof caches === "undefined" ? undefined : caches.open(SHARES);
}

/**
 * Lets go of the kept copy of every shared file the draft no longer holds:
 * one removed from the box, or sent with a capture.
 */
export function releasing(open: () => Promise<Holding | undefined> = shares) {
  return (held: readonly File[]): void => {
    const gone = [...kept].filter(([file]) => !held.includes(file));
    if (gone.length === 0) return;
    for (const [file] of gone) kept.delete(file);
    void open()
      .then(async (from) => {
        for (const [, at] of gone) await from?.delete(at);
      })
      .catch(() => undefined);
  };
}

onFilesHeld(releasing());

/**
 * Adds every share the worker holds to the end of the draft: the words after
 * what is written, the files after what is held. Nothing is let go of until
 * the draft has it: the words once written, the files once the draft no longer
 * holds them, so a shared file outlives the page it was drawn on. `none` where
 * nothing new was held, or where this browser keeps nothing for a worker to
 * have held it in.
 */
export async function shareIntoDraft(
  open: () => Promise<Holding | undefined> = shares,
): Promise<Restored | "none"> {
  const from = await open();
  if (from === undefined) return "none";
  const held = await readShares(from);

  const fresh = held.filter((share) => share.words !== undefined);
  const words = fresh
    .map((share) => share.words ?? "")
    .filter((said) => said !== "");
  const taken = new Set(kept.values());
  const files = held
    .flatMap((share) => share.files)
    .filter((one) => !taken.has(one.at));
  if (fresh.length === 0 && files.length === 0) return "none";

  for (const one of files) kept.set(one.file, one.at);
  const answer = restoreDraft(
    { text: words.join("\n\n"), tags: [] },
    files.map((one) => one.file),
  );
  if (answer === "unwritable") {
    for (const one of files) kept.delete(one.file);
    return answer;
  }

  for (const share of fresh) await fold(from, share.id);
  return answer;
}
