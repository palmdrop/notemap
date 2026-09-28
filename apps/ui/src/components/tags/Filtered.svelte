<script lang="ts">
  /**
   * What a surface is filtered by, each tag with the `×` that takes it off.
   * Drawn only while there is one: the whole surface says nothing about it.
   */
  let {
    filter,
    onlift,
  }: {
    filter: readonly string[];
    onlift: (tag: string) => void;
  } = $props();
</script>

{#if filter.length > 0}
  <div
    class="flex flex-wrap items-baseline gap-x-[1ch] pb-2"
    aria-label="Filter"
  >
    <span>tagged</span>
    {#each filter as tag, at (tag)}
      {#if at > 0}<span aria-hidden="true">·</span>{/if}
      <span class="inline-flex items-baseline gap-x-[0.5ch]">
        <span class="font-semibold">{tag}</span>
        <button
          type="button"
          class="hover:underline"
          aria-label="Stop filtering by {tag}"
          onclick={() => onlift(tag)}
        >
          ×
        </button>
      </span>
    {/each}
  </div>
{/if}
