import { onMount } from "svelte";

import { client } from "./client";

/** Which rows the outbox is still holding work for. A refusal is not one. */
export function pending() {
  let held = $state<ReadonlySet<string> | undefined>(undefined);

  onMount(() => {
    const watching = client.pending.subscribe((ids) => {
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
