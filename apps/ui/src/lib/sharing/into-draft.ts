import { restoreDraft, type Restored } from "$lib/draft";

import { SHARES, takeShares } from "./held";

/**
 * Adds every share the worker holds to the end of the draft: the words after
 * what is written, the files after what is held. `none` where nothing was
 * held, or where this browser keeps nothing for a worker to have held it in.
 */
export async function shareIntoDraft(): Promise<Restored | "none"> {
  if (typeof caches === "undefined") return "none";
  const { words, files } = await takeShares(await caches.open(SHARES));
  if (words.length === 0 && files.length === 0) return "none";
  return restoreDraft({ text: words.join("\n\n"), tags: [] }, files);
}
