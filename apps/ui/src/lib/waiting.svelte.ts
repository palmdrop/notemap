import { onMount } from "svelte";

import { client } from "./client";

export function waiting() {
  let held = $state(0);

  onMount(() => {
    const watching = client.waiting.subscribe((count) => {
      held = count;
    });

    return () => watching.unsubscribe();
  });

  return {
    get count() {
      return held;
    },
  };
}
