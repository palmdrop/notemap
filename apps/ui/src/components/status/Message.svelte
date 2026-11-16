<script lang="ts">
  import { arrive } from "$lib/motion";
  import type { Notice } from "$lib/notices.svelte";

  /**
   * The line's left when nothing is in flight: the newest notice still live,
   * cut to fit, with whatever it offers beside it as an underlined word.
   * Tapping the words opens the notices, where the rest of it is.
   */
  let {
    notice,
    ontoggle,
    ontake,
  }: {
    notice: Notice;
    ontoggle: () => void;
    ontake: (id: string) => void;
  } = $props();
</script>

{#key notice.id}
  <button
    type="button"
    onclick={ontoggle}
    in:arrive
    class="min-w-0 flex-1 truncate text-left {notice.alarm === true
      ? 'text-danger'
      : ''}"
  >
    <span role={notice.alarm === true ? "alert" : "status"}>
      {notice.what}
      {#if notice.subject !== undefined}
        <b>{notice.subject}</b
        >{/if}{#if notice.alarm === true && notice.why !== undefined}: {notice.why}{/if}
    </span>
  </button>
{/key}

{#if notice.offer !== undefined}
  <button
    type="button"
    class="flex-none underline underline-offset-[0.2em]"
    onclick={() => ontake(notice.id)}
  >
    {notice.offer.label}
  </button>
{/if}
