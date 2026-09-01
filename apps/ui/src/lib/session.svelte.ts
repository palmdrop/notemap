import { onMount } from "svelte";

import type { SessionState } from "@notemap/client";

import { client } from "./client";

let held: SessionState = $state({
  required: false,
  signedIn: false,
  known: false,
});

let readers = 0;
let drop: (() => void) | undefined;

/**
 * One subscription and one ask however many surfaces read this — the chrome and
 * settings both do, and a surface reading it is not a second opinion about who
 * is signed in.
 */
function hold(): () => void {
  if (readers === 0) {
    const watching = client.session.subscribe((current) => {
      held = current;
    });

    // Swallowed: a daemon that cannot be reached leaves this unknown, which the
    // chrome draws as waiting rather than as a login nobody asked for.
    void client.askSession().catch(() => undefined);

    drop = () => watching.unsubscribe();
  }

  readers += 1;

  return () => {
    readers -= 1;
    if (readers > 0) return;

    drop?.();
    drop = undefined;
  };
}

export function session() {
  onMount(hold);

  return {
    get known() {
      return held.known;
    },
    /** The door is shut and nobody is through it: draw the login and nothing else. */
    get shut() {
      return held.known && held.required && !held.signedIn;
    },
    /** Only where there is a door to come back out of. */
    get canSignOut() {
      return held.required && held.signedIn && held.as?.kind === "session";
    },
  };
}
