import { onMount } from "svelte";

import type { SessionState } from "@notemap/client";

import { client } from "./client";

let held: SessionState = $state({
  required: false,
  signedIn: false,
  known: false,
});

const KEPT = "notemap:session";

/** The last answer the pool gave, kept on this device for a start with no pool to ask. */
function kept(): SessionState | undefined {
  try {
    const said = JSON.parse(localStorage.getItem(KEPT) ?? "null") as unknown;
    if (said === null || typeof said !== "object") return undefined;
    const { required, signedIn } = said as Record<string, unknown>;
    if (typeof required !== "boolean" || typeof signedIn !== "boolean") {
      return undefined;
    }
    return { required, signedIn, known: true };
  } catch {
    return undefined;
  }
}

function keep(answer: SessionState): void {
  if (!answer.known) return;
  localStorage.setItem(
    KEPT,
    JSON.stringify({ required: answer.required, signedIn: answer.signedIn }),
  );
}

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
      keep(current);
    });

    // A daemon that cannot be reached answers with what it last said here, so
    // a start in flight mode draws what this device holds; with nothing kept
    // it stays unknown, drawn as waiting rather than as a login nobody asked for.
    void client.askSession().catch(() => {
      const last = kept();
      if (!held.known && last !== undefined) held = last;
    });

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
    /** Who this is, as the drawer says it: nobody where the pool asks no one. */
    get who(): string {
      if (!held.required) return "no password set";
      if (!held.signedIn) return "signed out";
      return held.as?.kind === "token"
        ? `signed in with ${held.as.name ?? "a token"}`
        : "signed in";
    },
    /** Only where there is a door to come back out of. */
    get canSignOut() {
      return held.required && held.signedIn && held.as?.kind === "session";
    },
  };
}
