<script lang="ts">
  import type { Snippet } from "svelte";

  import { fade } from "$lib/motion";

  /**
   * The actions of a page, docked at its foot under a rule at every width:
   * where the thumb is on a phone, and out of the way of what is read when
   * wide, where it stands the height of the menu's foot so the two rules
   * are one line.
   * `say` is the ruled line over the bar: why the main action cannot be
   * taken yet, or what the page just did.
   */
  let {
    say,
    label = "Actions",
    children,
  }: {
    say?: Snippet | undefined;
    label?: string;
    children: Snippet;
  } = $props();
</script>

<div data-bar="foot" class="sticky bottom-0 z-10">
  {#if say !== undefined}
    <p
      transition:fade
      class="border-t border-rule bg-paper px-gutter py-2 text-small text-muted empty:hidden"
    >
      {@render say()}
    </p>
  {/if}
  <div
    role="toolbar"
    aria-label={label}
    class="flex w-full items-stretch gap-2 border-t border-rule bg-off px-gutter pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] wide:h-foot wide:items-center wide:py-0"
  >
    {@render children()}
  </div>
</div>
