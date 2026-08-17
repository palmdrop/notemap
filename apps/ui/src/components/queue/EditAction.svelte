<script lang="ts">
  import type { Item } from "@notemap/client";

  import { client } from "$lib/client";

  let { item }: { item: Item } = $props();

  let open = $state(false);
  let draft = $state("");

  function begin() {
    draft = client.says(item);
    open = true;
  }

  /**
   * The pool decides whether this lands as an amendment or a revision, so
   * nothing here says which — the list simply shows what it recorded.
   */
  function save(event: SubmitEvent) {
    event.preventDefault();
    open = false;
    void client.edit(item.id, client.saying(item, draft));
  }
</script>

{#if open}
  <!-- Full width so it takes a line of its own in the row of actions. -->
  <form onsubmit={save} class="grid w-full gap-2">
    <textarea
      bind:value={draft}
      rows="4"
      aria-label="What it says"
      class="w-full border border-neutral-300 bg-transparent p-2 dark:border-neutral-700"
    ></textarea>
    <div class="flex gap-3 text-sm">
      <button type="submit" class="underline">Save</button>
      <button type="button" onclick={() => (open = false)} class="underline">
        Cancel
      </button>
    </div>
  </form>
{:else}
  <button type="button" onclick={begin} class="underline">Edit</button>
{/if}
