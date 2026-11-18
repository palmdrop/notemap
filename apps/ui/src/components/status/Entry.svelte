<script lang="ts">
  import type { Snippet } from "svelte";

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

  const capital = (word: string): string =>
    word.charAt(0).toUpperCase() + word.slice(1);
</script>

<!-- Under a heading, a notice says only its time and its words; work still
     in flight has no time, and takes the whole width. -->
<li
  transition:slide={{ fade: true }}
  class="grid gap-x-gutter border-b border-rule px-gutter py-3 {when ===
  undefined
    ? 'grid-cols-1'
    : 'grid-cols-[var(--spacing-time)_1fr]'}"
>
  {#if when !== undefined}
    <span class="text-time text-muted tabular-nums">{when}</span>
  {/if}

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
          <!-- Cancel and Undo are quiet: underlined words, not boxes. -->
          <button
            type="button"
            onclick={offer.take}
            class="underline underline-offset-[0.2em]"
            >{capital(offer.label)}</button
          >
        {/if}

        {@render actions?.()}

        {#if href !== undefined}
          <a {href} class="ml-auto underline underline-offset-[0.2em]">Open</a>
        {/if}
      </span>
    {/if}
  </span>
</li>
