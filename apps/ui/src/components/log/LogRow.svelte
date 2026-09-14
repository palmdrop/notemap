<script lang="ts">
  import type { Action, Order } from "@notemap/client";

  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { agentOf, failed, flattened } from "$lib/actions";

  import About from "./About.svelte";
  import Detail from "./Detail.svelte";

  let { action, order }: { action: Action; order: Order } = $props();

  const bad = $derived(failed(action.kind));
  const pairs = $derived(flattened(action.detail));
</script>

<Rail>
  <Stamp at={action.at} />
  <div class="mt-2 break-words">{agentOf(action.by)}</div>
</Rail>

<Body>
  <div>
    <StateWord word={action.kind} inline failed={bad} />

    {#if action.subject !== undefined}
      <About id={action.subject} {order} />
    {/if}

    {#if pairs.length > 0}
      <Detail {pairs} failed={bad} />
    {/if}
  </div>
</Body>
