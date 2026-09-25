<script lang="ts">
  import { rise, slide } from "$lib/motion";

  /**
   * Something that has already happened, said to somebody who did not ask. The
   * alarm is spent where it may want acting on; a confirmation is the ink.
   *
   * Standing usually means something went wrong, so it carries the accent by
   * default — but not always: a notice may stand because what it offers must
   * not time out under somebody's hands, which is not an alarm and may not be
   * drawn as one.
   */
  let {
    what,
    why,
    about,
    href,
    offer,
    standing = false,
    alarm,
    ondismiss,
  }: {
    what: string;
    why?: string;
    about?: string;
    href?: string;
    /** Something to do about it, taken here. Named by what it does. */
    offer?: { label: string; take: () => void };
    standing?: boolean;
    alarm?: boolean;
    ondismiss?: () => void;
  } = $props();

  const alarming = $derived(alarm ?? standing);
</script>

<div
  in:rise
  out:slide={{ fade: true }}
  role={alarming ? "alert" : "status"}
  class="grid gap-1.5 border bg-ground px-3 py-2.5 {alarming
    ? 'border-alarm text-alarm'
    : 'border-ink'}"
>
  <span class="break-words">{what}</span>

  {#if why !== undefined}
    <span class="break-words">{why}</span>
  {/if}

  {#if about !== undefined}
    <span class="break-words">{about}</span>
  {/if}

  {#if href !== undefined || offer !== undefined || ondismiss !== undefined}
    <span class="flex justify-end gap-4">
      {#if href !== undefined}
        <a {href} class="underline">look</a>
      {/if}

      {#if offer !== undefined}
        <button type="button" onclick={offer.take} class="underline">
          {offer.label}
        </button>
      {/if}

      {#if ondismiss !== undefined}
        <button type="button" onclick={ondismiss} class="underline">
          dismiss
        </button>
      {/if}
    </span>
  {/if}
</div>
