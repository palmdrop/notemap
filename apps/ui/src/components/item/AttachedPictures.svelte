<script lang="ts">
  import type { Attachment } from "@notemap/client";

  import { drawn } from "$lib/attachments";

  /**
   * The pictures an item carries that are drawn, above its words, bounded by
   * `picture` so a tall one cannot swallow what holds it.
   */
  let {
    attachments,
    picture,
  }: { attachments: readonly Attachment[]; picture: string } = $props();

  const pictures = $derived(drawn(attachments).pictures);
</script>

{#each pictures as one (one.asset)}
  <img
    src={one.url}
    alt=""
    loading="lazy"
    class="mb-2 block max-w-full object-contain object-left {picture}"
  />
{/each}
