import { onMount } from "svelte";

import { client } from "./client";

/** The browser's own opinion is kept only as a second no; the client's is the first. */
export function reachable() {
  let online = $state(true);
  let answering = $state(true);

  onMount(() => {
    online = navigator.onLine;

    // The client would notice within a backoff; the platform knows sooner.
    const up = () => {
      online = true;
      void client.drain();
    };
    const down = () => (online = false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);

    const held = client.reachable.subscribe((yes) => {
      answering = yes;
    });

    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      held.unsubscribe();
    };
  });

  return {
    get yes() {
      return online && answering;
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
