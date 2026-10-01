<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * One line of the panel: when, what and why, the capture it was about, and
   * what can be done about it here. The ways out are drawn only while there is
   * still something for them to do.
   */
  let {
    when,
    what,
    why,
    about,
    href,
    alarm = false,
    offer,
    mark,
  }: {
    /** A time, or nothing for work still in flight. */
    when?: string;
    what: string;
    why?: string;
    about?: string;
    href?: string;
    alarm?: boolean;
    offer?: { label: string; take: () => void };
    /** Drawn after `what`: a countdown, or the asking mark. */
    mark?: Snippet;
  } = $props();
</script>

<li
  class="grid grid-cols-[3rem_1fr] gap-x-4 border-b border-ink px-3 py-2 last:border-b-0 max-narrow:grid-cols-1 {alarm
    ? 'text-alarm'
    : ''}"
>
  <span class="tabular-nums max-narrow:hidden">{when ?? ""}</span>

  <span class="grid min-w-0 gap-0.5">
    <span class="flex items-baseline gap-2 wrap-anywhere">
      <span>{what}</span>
      {@render mark?.()}
    </span>

    {#if why !== undefined}
      <span class="wrap-anywhere">{why}</span>
    {/if}

    {#if about !== undefined}
      <span class="wrap-anywhere">{about}</span>
    {/if}

    {#if href !== undefined || offer !== undefined}
      <span class="flex justify-end gap-4">
        {#if href !== undefined}
          <a {href} class="underline">look</a>
        {/if}

        {#if offer !== undefined}
          <button type="button" onclick={offer.take} class="underline">
            {offer.label}
          </button>
        {/if}
      </span>
    {/if}
  </span>
</li>
