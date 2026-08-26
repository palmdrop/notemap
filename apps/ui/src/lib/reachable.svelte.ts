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

    const looking = () =>
      client.watched(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", looking);
    looking();

    const held = client.reachable.subscribe((yes) => {
      answering = yes;
    });

    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", looking);
      held.unsubscribe();
    };
  });

  return {
    get yes() {
      return online && answering;
    },
  };
}
