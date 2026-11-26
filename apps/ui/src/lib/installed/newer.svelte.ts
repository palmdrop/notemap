import { version } from "$app/environment";
import { updated } from "$app/state";

import { isKeeps, WHICH_BUILD } from "$lib/worker/kept";

let drawn = $state(false);
let kept = $state<string | undefined>(undefined);

/**
 * Follows the worker the page is drawn by, and the build it keeps. Asked
 * rather than watched for: a newer worker may take over before anything here
 * is listening.
 */
export function watchWorker(): () => void {
  if (!("serviceWorker" in navigator)) return () => undefined;
  const workers = navigator.serviceWorker;
  const ask = () => {
    drawn = workers.controller !== null;
    workers.controller?.postMessage(WHICH_BUILD);
  };
  const told = (event: MessageEvent) => {
    if (isKeeps(event.data)) kept = event.data.keeps;
  };
  workers.addEventListener("message", told);
  workers.addEventListener("controllerchange", ask);
  workers.startMessages();
  ask();
  return () => {
    workers.removeEventListener("message", told);
    workers.removeEventListener("controllerchange", ask);
  };
}

/**
 * Whether a reload draws a newer build. A page the worker draws comes from
 * what it keeps, so a newer build counts once the worker keeps one; without a
 * worker, once the daemon serves it.
 */
export const newer = {
  get current(): boolean {
    return drawn ? kept !== undefined && kept !== version : updated.current;
  },
};
