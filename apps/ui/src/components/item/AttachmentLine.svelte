<script lang="ts">
  import { nameOf, sizeOf } from "$lib/attachments";

  /** One attachment as words: what it is called, what it is, and the bytes to take away. */
  let {
    name,
    url,
    mime,
    bytes,
  }: { name?: string; url: string; mime?: string; bytes?: number } = $props();

  const facts = $derived(
    [mime, bytes === undefined ? undefined : sizeOf(bytes)].filter(
      (fact): fact is string => fact !== undefined && fact !== "",
    ),
  );
</script>

<div class="flex min-w-0 flex-wrap items-baseline gap-x-2">
  <a href={url} download={nameOf({ filename: name })} class="break-all"
    >{nameOf({ filename: name })}</a
  >
  {#each facts as fact (fact)}
    <span aria-hidden="true">·</span>
    <span>{fact}</span>
  {/each}
</div>
