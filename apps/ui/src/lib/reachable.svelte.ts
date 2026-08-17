import { onMount } from "svelte";

import { client } from "./client";

/**
 * Whether the pool looks reachable, which is all a shell can honestly say: the
 * transport reports no reachability yet, so this is the browser's own opinion
 * plus whatever the outbox has already failed to send.
 */
export function reachable() {
  let online = $state(true);
  let failing = $state(false);

  onMount(() => {
    online = navigator.onLine;

    // Coming back is the moment the outbox has been waiting for; nothing else
    // will ask, so a capture made offline would sit until the next mutation.
    const up = () => {
      online = true;
      void client.drain();
    };
    const down = () => (online = false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);

    const held = client.outbox.subscribe((outbox) => {
      failing = outbox.some((held) => held.state === "unreachable");
    });

    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      held.unsubscribe();
    };
  });

  return {
    get yes() {
      return online && !failing;
    },
  };
}
