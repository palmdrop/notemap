<script lang="ts">
  import { rise } from "$lib/motion";
  import type { Notice } from "$lib/notices.svelte";

  import { PANEL } from "./panel";

  /**
   * The left of the status line: `notices`, which the panel opens from and is
   * always there to open, then the newest notice still live, on one line and
   * cut to fit, with whatever it offers beside it. Where no notice is live it
   * says what the pool refused, or nothing.
   */
  let {
    notice,
    refused,
    expanded,
    ontoggle,
    ontake,
    ondismiss,
    onrelease,
  }: {
    notice?: Notice;
    /** The newest refusal, said where no notice is live. */
    refused?: { readonly id: string; readonly what: string };
    expanded: boolean;
    ontoggle: () => void;
    ontake: (id: string) => void;
    ondismiss: (id: string) => void;
    /** Lets go of a refusal: the client stops holding what the pool never took. */
    onrelease: (operation: string) => void;
  } = $props();

  const said = $derived(
    notice !== undefined
      ? {
          id: notice.id,
          what: notice.what,
          why: notice.why,
          alarm: notice.alarm ?? notice.standing === true,
        }
      : refused !== undefined
        ? { id: refused.id, what: refused.what, why: undefined, alarm: true }
        : undefined,
  );
</script>

<div class="flex min-w-0 flex-1 items-baseline gap-4 max-narrow:gap-3">
  <button
    type="button"
    aria-label="notices"
    aria-expanded={expanded}
    aria-controls={PANEL}
    onclick={ontoggle}
    class="flex-none whitespace-nowrap"
    class:font-semibold={expanded}
  >
    <span class="max-narrow:hidden">notices</span>
    {expanded ? "▾" : "▴"}
  </button>

  {#if said !== undefined}
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={PANEL}
      onclick={ontoggle}
      class="min-w-0 truncate text-left {said.alarm ? 'text-alarm' : ''}"
    >
      {#key said.id}
        <span in:rise role={said.alarm ? "alert" : "status"}>
          {said.what}{#if said.why !== undefined}<span class="max-narrow:hidden"
              >&ensp;{said.why}</span
            >{/if}
        </span>
      {/key}
    </button>

    {#if notice?.offer !== undefined}
      <button
        type="button"
        class="flex-none underline"
        onclick={() => ontake(notice.id)}
      >
        {notice.offer.label}
      </button>
    {/if}

    {#if notice?.standing === true}
      <button
        type="button"
        class="flex-none underline"
        onclick={() => ondismiss(notice.id)}
      >
        dismiss
      </button>
    {:else if notice === undefined && refused !== undefined}
      <button
        type="button"
        class="flex-none underline"
        onclick={() => onrelease(refused.id)}
      >
        dismiss
      </button>
    {/if}
  {/if}
</div>
