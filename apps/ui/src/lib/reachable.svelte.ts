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

let readers = 0;
let drop: (() => void) | undefined;

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
    });

    drop = () => {
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

export function reachable() {
  onMount(hold);

  return {
    get yes() {
      return online && answering;
    },
    get at() {
      return answeredAt;
    },
    /** Only where the probe measured it; an ordinary answer carries no timing. */
    get ms() {
      return answeredIn;
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
