<script lang="ts">
  import type { Attachment } from "@notemap/client";

  import { drawn } from "$lib/attachments";

  import AttachmentLine from "./AttachmentLine.svelte";

  /**
   * What an item carries, in slot order: the first pictures drawn, bounded by
   * `picture` so a tall one cannot swallow what holds it, and every other
   * attachment a line.
   */
  let {
    attachments,
    picture,
  }: { attachments: readonly Attachment[]; picture: string } = $props();

  const shown = $derived(drawn(attachments));
</script>

{#each shown.pictures as one (one.asset)}
  <img
    src={one.url}
    alt=""
    loading="lazy"
    class="mb-2 block max-w-full object-contain object-left {picture}"
  />
{/each}

{#if shown.lines.length > 0}
  <div class="mb-2">
    {#each shown.lines as one (one.asset)}
      <AttachmentLine
        name={one.filename}
        url={one.url}
        mime={one.mime}
        bytes={one.bytes}
      />
    {/each}
  </div>
{/if}
