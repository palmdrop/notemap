<script lang="ts">
  import { nameOf, sizeOf } from "$lib/attachments";

  /** One attachment as words: its name, which takes the bytes away, and how many there are. */
  let { name, url, bytes }: { name?: string; url: string; bytes?: number } =
    $props();
</script>

<div class="flex min-w-0 flex-wrap items-baseline gap-x-2">
  <a
    href={url}
    download={nameOf({ filename: name })}
    class="font-semibold break-all">{nameOf({ filename: name })}</a
  >
  {#if bytes !== undefined}
    <span class="whitespace-nowrap">{sizeOf(bytes)}</span>
  {/if}
</div>
