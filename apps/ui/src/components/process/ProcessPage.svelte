<script lang="ts">
  import type { ItemState } from "@notemap/client";

  import Process from "$components/process/Process.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { client } from "$lib/client";
  import { NO_ITEM_OFFLINE, NO_SUCH_ITEM } from "$lib/said";

  /** One item being processed, read the way its own surface reads it. */
  let { id }: { id: string } = $props();

  let read = $state<ItemState | undefined>(undefined);

  // The read settles what is drawn and what it was drawn from; the item itself
  // is then the client's held copy, so a tag taken here is drawn at once.
  const held = $derived(client.held(id));
  const item = $derived($held);

  $effect(() => {
    const wanted = id;
    read = undefined;

    void (async () => {
      const answer = await client.item(wanted);
      if (wanted === id) read = answer;
    })();
  });

  const refused = $derived(
    read?.failure?.refused === true ? read.failure.said : undefined,
  );
</script>

{#if item !== undefined}
  {#key item.id}
    <Process {item} />
  {/key}
{:else if read !== undefined}
  <div class="pt-8">
    {#if refused !== undefined}
      <div role="status" class="text-alarm">{refused}</div>
    {:else if read.failure !== undefined}
      <div>{NO_ITEM_OFFLINE}</div>
    {:else}
      <Prose text={NO_SUCH_ITEM} />
    {/if}
  </div>
{:else}
  <div class="pt-8"><Asking /></div>
{/if}
