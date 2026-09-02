<script lang="ts">
  import type { Action } from "@notemap/client";

  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { agentOf, failed, flattened } from "$lib/actions";

  import Detail from "./Detail.svelte";
  import Id from "./Id.svelte";

  let { action, first = false }: { action: Action; first?: boolean } = $props();

  const bad = $derived(failed(action.kind));
  const pairs = $derived(flattened(action.detail));
</script>

<Rail {first}>
  <Stamp at={action.at} />
  <div class="mt-2 break-words text-ink-muted">{agentOf(action.by)}</div>
</Rail>

<Body {first}>
  <div class="font-mono">
    <StateWord word={action.kind} inline failed={bad} />

    {#if action.subject !== undefined}
      <div class="mt-2 text-ink-muted">
        about <Id id={action.subject} link />
      </div>
    {/if}

    {#if pairs.length > 0}
      <Detail {pairs} failed={bad} />
    {/if}
  </div>
</Body>
