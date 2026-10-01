<script lang="ts">
  import { arrive } from "$lib/motion";
  import type { Notice } from "$lib/notices.svelte";

  import { PANEL } from "./panel";

  /**
   * The left of the status line: `notices`, which the panel opens from and is
   * always there to open, counting what went wrong since it was last opened;
   * then the newest notice still live, in its few words and cut to fit, with
   * whatever it offers beside it. The rest of a notice is the panel's.
   */
  let {
    notice,
    unseen,
    expanded,
    ontoggle,
    ontake,
  }: {
    notice?: Notice;
    unseen: number;
    expanded: boolean;
    ontoggle: () => void;
    ontake: (id: string) => void;
  } = $props();

  const label = $derived(
    unseen > 0 ? `notices, ${String(unseen)} gone wrong` : "notices",
  );
</script>

<div class="flex min-w-0 flex-1 items-baseline gap-4 max-narrow:gap-3">
  <button
    type="button"
    aria-label={label}
    aria-expanded={expanded}
    aria-controls={PANEL}
    onclick={ontoggle}
    class="flex-none whitespace-nowrap"
    class:font-semibold={expanded}
  >
    <span class="max-narrow:hidden">notices</span>
    {#if unseen > 0}
      <span class="text-alarm tabular-nums">({unseen})</span>
    {/if}
    {expanded ? "▾" : "▴"}
  </button>

  {#if notice !== undefined}
    {#key notice.id}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={PANEL}
        onclick={ontoggle}
        in:arrive
        class="min-w-0 truncate text-left {notice.alarm === true
          ? 'text-alarm'
          : ''}"
      >
        <span role={notice.alarm === true ? "alert" : "status"}>
          {notice.what}
        </span>
      </button>
    {/key}

    {#if notice.offer !== undefined}
      <button
        type="button"
        class="flex-none underline"
        onclick={() => ontake(notice.id)}
      >
        {notice.offer.label}
      </button>
    {/if}
  {/if}
</div>
