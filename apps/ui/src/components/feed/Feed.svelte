<script lang="ts">
  import { onMount } from "svelte";

  import Item from "$components/item/Item.svelte";
  import type { Feed } from "$lib/feed/feed.svelte";

  let { feed }: { feed: Feed } = $props();

  onMount(() => void feed.load());
</script>

{#if feed.failure !== undefined}
  <p class="mt-4 text-sm text-red-700 dark:text-red-300" role="status">
    {feed.failure}
  </p>
{/if}

{#if feed.items.length > 0}
  <ol
    class="mt-8 grid list-none gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 p-0 dark:border-neutral-800 dark:bg-neutral-800"
  >
    {#each feed.items as item (item.id)}
      <Item {item} />
    {/each}
  </ol>
{:else if !feed.loading && feed.failure === undefined}
  <p class="mt-8 text-sm text-neutral-500 dark:text-neutral-400">
    Nothing captured yet.
  </p>
{/if}

{#if feed.more}
  <button
    type="button"
    disabled={feed.loading}
    onclick={() => void feed.load()}
    class="mt-4 rounded-lg border border-neutral-300 px-4 py-1.5 disabled:opacity-50 dark:border-neutral-700"
  >
    {feed.loading ? "Loading…" : "Load more"}
  </button>
{/if}
