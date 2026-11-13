<script lang="ts">
  import type { Snippet } from "svelte";

  import Box from "$components/primitives/blocks/Box.svelte";
  import { slide } from "$lib/motion";

  /**
   * One line of the panel: when, what and why, the capture it was about, and
   * what can be done about it here. The ways out are drawn only while there is
   * still something for them to do.
   */
  let {
    when,
    what,
    subject,
    why,
    about,
    href,
    alarm = false,
    offer,
    mark,
    actions,
  }: {
    /** A time, or nothing for work still in flight. */
    when?: string;
    what: string;
    subject?: string;
    why?: string;
    about?: string;
    href?: string;
    alarm?: boolean;
    offer?: { label: string; take: () => void };
    /** Drawn after `what`: a countdown, or the asking mark. */
    mark?: Snippet;
    /** More than one thing to do about it, drawn after the offer. */
    actions?: Snippet;
  } = $props();
</script>

<li
  transition:slide={{ fade: true }}
  class="grid grid-cols-[var(--spacing-time)_1fr] gap-x-gutter border-b border-rule px-gutter py-3"
>
  <span class="text-time text-muted tabular-nums">{when ?? ""}</span>

  <span class="grid min-w-0 gap-1">
    <span
      class="flex items-center gap-2 wrap-anywhere {alarm ? 'text-danger' : ''}"
    >
      {@render mark?.()}
      <span>
        {what}
        {#if subject !== undefined}
          <b>{subject}</b>
        {/if}
      </span>
    </span>

    {#if about !== undefined}
      <span class="text-small wrap-anywhere text-muted">{about}</span>
    {/if}

    {#if why !== undefined}
      <span class="wrap-anywhere whitespace-pre-line">{why}</span>
    {/if}

    {#if href !== undefined || offer !== undefined || actions !== undefined}
      <span class="mt-1 flex flex-wrap items-center gap-2">
        {#if offer !== undefined}
          <Box onclick={offer.take}>{offer.label}</Box>
        {/if}

        {@render actions?.()}

        {#if href !== undefined}
          <a {href} class="ml-auto underline underline-offset-[0.2em]">open</a>
        {/if}
      </span>
    {/if}
  </span>
</li>
