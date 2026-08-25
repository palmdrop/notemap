import { onMount } from "svelte";

import { client } from "./client";

/**
 * Whether the pool is reachable, as the client reports it: a real request
 * having just answered, kept honest by its own probe. The browser's own opinion
 * is kept only as a second no — a network that exists says nothing about the
 * daemon, but one that does not is evidence enough.
 */
export function reachable() {
  let online = $state(true);
  let answering = $state(true);

  onMount(() => {
    online = navigator.onLine;

    // The client notices on its own within a backoff; the platform knowing
    // sooner is worth the drain being immediate rather than in a few seconds.
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
