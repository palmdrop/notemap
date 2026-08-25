import { onMount } from "svelte";

import { client } from "./client";

/** A refusal is not waiting: it will not drain, and it has the corner to itself. */
export function waiting() {
  let held = $state(0);

  onMount(() => {
    const watching = client.outbox.subscribe((outbox) => {
      held = outbox.filter((one) => one.state !== "refused").length;
    });

    return () => watching.unsubscribe();
  });

  return {
    get count() {
      return held;
    },
  };
}
