<script lang="ts">
  import { log } from "$lib/log.svelte";

  import { logHref } from "./href";
  import { VIEWS, viewOf } from "./views";

  const current = $derived(viewOf(log.kinds));
</script>

<nav class="mt-2 font-mono text-ink-muted" aria-label="Narrow the log to">
  {#if log.kinds === undefined}
    <span class="text-ink">everything</span>
  {:else}
    <a href={logHref(log.order, log.item)} class="text-ink-muted">everything</a>
  {/if}
  {#each VIEWS as view (view.name)}
    <span aria-hidden="true"> · </span>
    {#if current?.name === view.name}
      <span class="text-ink">{view.name}</span>
    {:else}
      <a href={logHref(log.order, log.item, view.kinds)} class="text-ink-muted">
        {view.name}
      </a>
    {/if}
  {/each}
</nav>
