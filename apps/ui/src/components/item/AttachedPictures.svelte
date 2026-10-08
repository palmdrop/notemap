<script lang="ts">
  import type { Attachment } from "@notemap/client";

  import { drawn } from "$lib/attachments";
  import { revealed } from "$lib/motion";

  /**
   * The pictures an item carries that are drawn, above its words, bounded by
   * `picture` so a tall one cannot swallow what holds it. One the pool has
   * measured keeps its room before it arrives, and fades in over it; one that
   * cannot be had gives the room back rather than holding an empty box.
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
    width={one.dimensions?.width}
    height={one.dimensions?.height}
    {@attach revealed}
    class="mb-2 block h-auto max-w-full object-contain object-left opacity-0 transition-opacity duration-(--duration-short) ease-fade data-failed:hidden data-loaded:opacity-100 {picture}"
  />
{/each}
