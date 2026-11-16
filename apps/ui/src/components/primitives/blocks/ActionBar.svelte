<script lang="ts">
  import type { Snippet } from "svelte";

  import { width } from "$lib/breakpoint";
  import { fade } from "$lib/motion";

  /**
   * The actions of a page. On a phone, docked at its foot under a rule, where
   * the thumb is; when wide, a toolbar at the head of the pane it acts on.
   * `say` is the ruled line over the bar: why the main action cannot be
   * taken yet, or what the page just did.
   */
  let {
    at,
    say,
    label = "Actions",
    children,
  }: {
    /** Where it sits, when the width should not decide. */
    at?: "foot" | "head";
    say?: Snippet | undefined;
    label?: string;
    children: Snippet;
  } = $props();

  const head = $derived((at ?? (width.wide ? "head" : "foot")) === "head");
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
    class="flex w-full items-stretch gap-2 bg-off px-gutter {head
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
