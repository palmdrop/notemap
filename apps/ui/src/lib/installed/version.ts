import { dev } from "$app/environment";
import { updated } from "$app/state";

import { heldFiles } from "$lib/draft";
import { leave, unsaved } from "$lib/leaving.svelte";
import { notices } from "$lib/notices.svelte";

export function registerWorker(): void {
  if (dev || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/service-worker.js").catch(() => {
    // A shell that cannot keep itself still works, online.
  });
}

/** Asks whether a newer build is served, now and whenever the shell comes back into view. */
export function watchVersion(): () => void {
  const ask = () => {
    if (document.visibilityState !== "visible") return;
    updated.check().catch(() => {
      // Unanswered is not newer.
    });
  };
  ask();
  document.addEventListener("visibilitychange", ask);
  return () => document.removeEventListener("visibilitychange", ask);
}

/** A reload loses what is only in memory: an open edit's changes, and attachments not captured. */
export function losing(): boolean {
  return unsaved() || heldFiles().length > 0;
}

/**
 * Where a move within the app should load the page instead, so that it lands
 * in the newer build: only where one is served and nothing would be lost.
 */
export function loadInstead(
  newer: boolean,
  move: { readonly willUnload: boolean; readonly to: { url: URL } | null },
): URL | undefined {
  if (!newer || move.willUnload || move.to === null || losing()) {
    return undefined;
  }
  return move.to.url;
}

/**
 * Reloads into the newer build, once an edit with changes is settled. Held
 * attachments have nowhere to ask about them, so the reload waits for them to
 * be captured or put back, and says so.
 */
export function reload(): void {
  if (heldFiles().length > 0) {
    notices.raise({
      what: "the reload waits for the attachments held: capture or remove them",
      key: "new-version-waits",
    });
    return;
  }
  leave(() => location.reload());
}
