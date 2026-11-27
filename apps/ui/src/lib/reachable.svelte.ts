import { onMount } from "svelte";

import type { Reach } from "@notemap/client";

import { client } from "./client";

/** The browser's own opinion is kept only as a second no; the client's is the first. */
let online = $state(true);
// Held apart: every answered request settles the mark, and a surface reading
// only whether the pool answers must not be woken by a stamp that moved.
let answering = $state(true);
let answeredAt = $state<string | undefined>(undefined);
let answeredIn = $state<number | undefined>(undefined);
let daemonVersion = $state<string | undefined>(undefined);

let readers = 0;
let drop: (() => void) | undefined;
/** Whether `online` is being kept, or the browser has to be asked. */
let listening = $state(false);

/**
 * One set of listeners however many surfaces are reading them: an `online`
 * event used to start a drain per mounted reader, and the client kept a
 * subscription per one.
 */
function hold(): () => void {
  if (readers === 0) {
    online = navigator.onLine;

    // The client would notice within a backoff; the platform knows sooner.
    const up = () => {
      online = true;
      void client.drain();
    };
    const down = () => (online = false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);

    const held = client.reachable.subscribe((mark: Reach) => {
      answering = mark.yes;
      answeredAt = mark.at;
      answeredIn = mark.ms;
      daemonVersion = mark.version;
    });

    listening = true;
    drop = () => {
      listening = false;
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      held.unsubscribe();
    };
  }

  readers += 1;

  return () => {
    readers -= 1;
    if (readers > 0) return;

    drop?.();
    drop = undefined;
  };
}

/** Mounted after what it draws, which would otherwise have asked as if online. */
function browserSaysOnline(): boolean {
  return listening ? online : navigator.onLine;
}

export function reachable() {
  onMount(hold);

  return {
    get yes() {
      return browserSaysOnline() && answering;
    },
    /**
     * Whether anything has said yet: the pool, by answering or failing to, or
     * the browser, by being offline. Until then `yes` is the client's optimism,
     * which is what acts, and nothing is said either way.
     */
    get known() {
      return !browserSaysOnline() || answeredAt !== undefined;
    },
    get at() {
      return answeredAt;
    },
    /** Only where the probe measured it; an ordinary answer carries no timing. */
    get ms() {
      return answeredIn;
    },
    /** The daemon's own version, once the health probe has answered once. */
    get version() {
      return daemonVersion;
    },
  };
}

/**
 * Whether anyone is looking, told to the client. Mounted once by the chrome:
 * a surface reading `reachable()` is not a second opinion about it, and the
 * last one to go says so rather than leaving the client asking on its own.
 */
export function watched(): void {
  onMount(() => {
    const looking = () =>
      client.watched(document.visibilityState === "visible");

    document.addEventListener("visibilitychange", looking);
    looking();

    return () => {
      document.removeEventListener("visibilitychange", looking);
      client.watched(false);
    };
  });
}
