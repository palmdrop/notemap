<script lang="ts" module>
  /** Read by a band, so a region of quiet headings — settings — sets it once. */
  export const QUIET = Symbol("quiet bands");
</script>

<script lang="ts">
  import { getContext, type Snippet } from "svelte";

  /**
   * The heading of a group of rows, as a day heads the queue: grey, ruled
   * edge to edge, in the display face. A single field takes a plain label.
   * Under settings it is quiet instead: a small grey label under a rule,
   * as the list of sections labels its groups.
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

  const quiet = getContext<boolean | undefined>(QUIET) === true;
</script>

<svelte:element
  this={`h${String(level)}`}
  {id}
  class="{quiet
    ? '-mt-px flex items-center gap-3 border-t border-rule px-gutter pt-5 pb-1.5 text-small font-semibold text-muted first-letter:uppercase'
    : '-mt-px flex min-h-9 items-center gap-3 border-y border-rule bg-band px-gutter font-display text-weekday font-normal lowercase'} {sticky
    ? 'sticky top-(--sticky-top,0) z-[2] bg-paper'
    : ''}"
>
  {@render children()}
  {#if end !== undefined}
    <span class="ml-auto font-text text-body normal-case">{@render end()}</span>
  {/if}
</svelte:element>
