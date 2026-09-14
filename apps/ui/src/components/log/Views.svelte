<script lang="ts">
  import { log } from "$lib/log.svelte";

  import { logHref } from "./href";
  import { VIEWS, viewOf } from "./views";

  const current = $derived(viewOf(log.kinds));
</script>

<nav class="mt-2" aria-label="Narrow the log to">
  {#if log.kinds === undefined}
    <span class="font-semibold">everything</span>
  {:else}
    <a href={logHref(log.order, log.item)}>everything</a>
  {/if}
  {#each VIEWS as view (view.name)}
    <span aria-hidden="true"> · </span>
    {#if current?.name === view.name}
      <span class="font-semibold">{view.name}</span>
    {:else}
      <a href={logHref(log.order, log.item, view.kinds)}>
        {view.name}
      </a>
    {/if}
  {/each}
</nav>
