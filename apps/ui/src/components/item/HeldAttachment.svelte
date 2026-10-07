<script lang="ts">
  import { slide } from "$lib/motion";

  import AttachmentLine from "./AttachmentLine.svelte";

  /**
   * One file where it is being put in — the capture box, or an edit — with
   * the `×` that drops it. A picture is drawn small beside its line, since it
   * is looked at to decide whether it goes. It carries the space under it, so
   * the space goes with it as it slides rather than jumping once it has gone.
   */
  let {
    name,
    url,
    bytes,
    picture = false,
    ondrop,
  }: {
    name: string;
    url: string | undefined;
    bytes?: number;
    picture?: boolean;
    ondrop: () => void;
  } = $props();
</script>

<div class="flex items-end gap-4 pb-2" transition:slide={{ fade: true }}>
  {#if picture}
    <!-- The picture's room is there before the picture is, so the line opens
         to the height it keeps. -->
    <div class="size-21 shrink-0 border border-ink">
      {#if url !== undefined}
        <img src={url} alt={name} class="size-full object-cover" />
      {/if}
    </div>
  {/if}
  <span class="min-w-0">
    <AttachmentLine {name} {url} {bytes} whole />
  </span>
  <button
    type="button"
    onclick={ondrop}
    aria-label={`remove ${name}`}
    class="shrink-0 hover:underline"
  >
    ×
  </button>
</div>
