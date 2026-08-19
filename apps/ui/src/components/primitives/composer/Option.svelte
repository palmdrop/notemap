<script lang="ts">
  /**
   * `why` is the reason an option cannot be taken; an unavailable one says so
   * and stays in the list rather than disappearing.
   */
  let {
    label,
    chosen = false,
    why,
    onchoose,
  }: {
    label: string;
    chosen?: boolean;
    why?: string;
    onchoose: () => void;
  } = $props();
</script>

<button
  type="button"
  onclick={onchoose}
  disabled={why !== undefined}
  aria-pressed={chosen}
  class="flex w-full items-baseline gap-2.5 py-px text-left"
>
  <span aria-hidden="true" class="w-[1ch] flex-none">{chosen ? "▸" : ""}</span>
  <span class:inverted={chosen} class={why === undefined ? "" : "text-ink-muted"}>
    {label}
  </span>
  {#if why !== undefined}
    <span class="ml-auto text-ink-muted">{why}</span>
  {/if}
</button>
