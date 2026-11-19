<script lang="ts">
  import type { Snippet } from "svelte";

  import { fade } from "$lib/motion";

  /**
   * The actions of a page, docked at its foot under a rule at every width:
   * where the thumb is on a phone, and out of the way of what is read when
   * wide.
   * `say` is the ruled line over the bar: why the main action cannot be
   * taken yet, or what the page just did.
   */
  let {
    at,
    say,
    label = "Actions",
    plain = false,
    children,
  }: {
    /** Where it sits, when the width should not decide. */
    at?: "foot" | "head";
    say?: Snippet | undefined;
    label?: string;
    /** At a page's head, the actions without the bar's beige, as lone boxes are. */
    plain?: boolean;
    children: Snippet;
  } = $props();

  const head = $derived(at === "head");
</script>

<div
  data-bar={head ? "head" : "foot"}
  class={head ? "border-b border-rule" : "sticky bottom-0 z-10"}
>
  {#if say !== undefined && !head}
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
    class="flex w-full items-stretch gap-2 px-gutter {head && plain
      ? 'bg-paper'
      : 'bg-off'} {head
      ? 'flex-wrap py-2'
      : 'border-t border-rule pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]'}"
  >
    {@render children()}
  </div>
  {#if say !== undefined && head}
    <p
      transition:fade
      class="bg-paper px-gutter py-2 text-small text-muted empty:hidden"
    >
      {@render say()}
    </p>
  {/if}
</div>
