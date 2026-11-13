<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * The heading of a group of rows, as a day heads the queue: grey, ruled
   * edge to edge, in the display face. A single field takes a plain label.
   */
  let {
    level = 2,
    id,
    sticky = false,
    children,
    end,
  }: {
    level?: 2 | 3;
    id?: string;
    sticky?: boolean;
    children: Snippet;
    end?: Snippet;
  } = $props();
</script>

<svelte:element
  this={`h${String(level)}`}
  {id}
  class="flex min-h-9 items-center gap-3 border-y border-rule bg-band px-gutter font-display text-weekday font-normal lowercase {sticky
    ? 'sticky top-(--sticky-top,0) z-[2]'
    : ''}"
>
  {@render children()}
  {#if end !== undefined}
    <span class="ml-auto font-text text-body normal-case">{@render end()}</span>
  {/if}
</svelte:element>
