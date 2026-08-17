<script lang="ts">
  import type { Item } from "@notemap/client";

  import { client } from "$lib/client";

  let { item }: { item: Item } = $props();

  let adding = $state("");

  const tags = $derived(item.tags ?? []);

  /** Classification replays from the outbox, so it is offered with the pool unreachable. */
  function add(event: SubmitEvent) {
    event.preventDefault();
    const name = adding.trim();
    if (name === "") return;

    adding = "";
    void client.tag(item.id, name);
  }
</script>

<div class="flex flex-wrap items-center gap-2 text-sm">
  {#each tags as tag (tag.name)}
    <span
      class="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800"
    >
      {tag.name}
      <button
        type="button"
        aria-label={`Remove ${tag.name}`}
        onclick={() => void client.untag(item.id, tag.name)}
        class="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        ×
      </button>
    </span>
  {/each}

  <form onsubmit={add} class="flex items-center gap-1">
    <input
      bind:value={adding}
      placeholder="tag"
      aria-label="Add a tag"
      class="w-24 border-b border-neutral-300 bg-transparent px-1 dark:border-neutral-700"
    />
  </form>
</div>
