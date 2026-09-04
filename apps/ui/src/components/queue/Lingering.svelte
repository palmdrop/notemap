<script lang="ts">
  import type { Item } from "@notemap/client";

  import Payload from "$components/item/Payload.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";

  /** Nothing here takes a handler: it is a row being watched out, not one to use. */
  let { item, word, furled }: { item: Item; word: string; furled: boolean } =
    $props();
</script>

<Rail>
  {#if !furled}
    <Stamp at={item.createdAt} />
    <StateWord {word} />
  {/if}
</Rail>

<Body>
  {#if furled}
    <div class="mb-2 flex flex-wrap items-baseline gap-3 font-mono">
      <Stamp at={item.createdAt} />
      <StateWord {word} inline />
    </div>
  {/if}

  <Payload {item} muted />
</Body>
