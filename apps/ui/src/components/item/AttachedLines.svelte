<script lang="ts">
  import type { Attachment } from "@notemap/client";

  import { drawn } from "$lib/attachments";

  import AttachmentLine from "./AttachmentLine.svelte";

  /**
   * Every attachment an item carries that is not drawn as a picture, under its
   * words. `ruled` sets them off from words above them with a short rule, the
   * way a footnote is; with nothing above, there is nothing to set them off from.
   */
  let {
    attachments,
    ruled,
  }: { attachments: readonly Attachment[]; ruled: boolean } = $props();

  const lines = $derived(drawn(attachments).lines);
</script>

{#if lines.length > 0}
  <div class="mb-2 {ruled ? 'mt-2' : ''}">
    {#if ruled}
      <div data-rule class="mb-1 w-12 border-t border-ink"></div>
    {/if}
    {#each lines as one (one.asset)}
      <AttachmentLine name={one.filename} url={one.url} bytes={one.bytes} />
    {/each}
  </div>
{/if}
