import { onMount } from "svelte";

import { client } from "./client";

export function pending() {
  let held = $state<ReadonlySet<string> | undefined>(undefined);

  onMount(() => {
    const watching = client.undrained.subscribe((ids) => {
      held = ids;
    });

    return () => watching.unsubscribe();
  });

  return {
    has(id: string) {
      return held?.has(id) ?? false;
    },
  };
}
