<script lang="ts">
  import { onMount, tick } from "svelte";

  import QueueItem from "$components/queue/QueueItem.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";
  import { readMark, writeMark } from "$lib/scroll-mark";

  const SURFACE = "queue";

  const queue = client.queue;
  const pool = reachable();

  onMount(() => {
    void (async () => {
      await client.loadQueue();
      await tick();
      window.scrollTo({ top: readMark(SURFACE) });
    })();

    // Scrolling past an item is a skip, and a skip changes nothing: this is
    // only where to put the view back on reload.
    const remember = () => writeMark(SURFACE, window.scrollY);
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  });
</script>

{#if $queue.failure !== undefined}
  <p class="mt-4 text-sm text-red-700 dark:text-red-300" role="status">
    {$queue.failure}
  </p>
{/if}

{#if $queue.items.length > 0}
  <ol
    class="mt-6 grid list-none gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 p-0 dark:border-neutral-800 dark:bg-neutral-800"
  >
    {#each $queue.items as item (item.id)}
      <QueueItem {item} offline={!pool.yes} />
    {/each}
  </ol>
{:else if !$queue.loading && $queue.failure === undefined}
  <p class="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
    Nothing to process.
  </p>
{/if}

{#if $queue.more}
  <button
    type="button"
    disabled={$queue.loading}
    onclick={() => void client.loadQueue()}
    class="mt-4 rounded-lg border border-neutral-300 px-4 py-1.5 disabled:opacity-50 dark:border-neutral-700"
  >
    {$queue.loading ? "Loading…" : "Load more"}
  </button>
{/if}
