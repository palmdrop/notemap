<script lang="ts">
  import { endKept, nameOf, sizeOf } from "$lib/attachments";

  /**
   * One attachment as words: its name, which takes the bytes away, and how
   * many there are. Read, a long name is cut in the middle so its extension
   * and the size stay on the line, and is whole in its title; `whole` is for
   * where a file is being put in, and wraps it instead. With no `url` yet the
   * name is drawn without a link, since an empty one would take the page.
   */
  let {
    name,
    url,
    bytes,
    whole = false,
  }: {
    name?: string;
    url?: string;
    bytes?: number;
    whole?: boolean;
  } = $props();

  const named = $derived(nameOf({ filename: name }));
  const cut = $derived(endKept(named));
  const size = $derived(bytes === undefined ? undefined : sizeOf(bytes));
  const tag = $derived(url === undefined ? "span" : "a");
  const download = $derived(url === undefined ? undefined : named);
</script>

{#if whole}
  <div class="min-w-0">
    <svelte:element
      this={tag}
      href={url}
      {download}
      class="font-semibold wrap-anywhere"
    >
      {named}
    </svelte:element>
    {#if size !== undefined}
      <span class="whitespace-nowrap">{size}</span>
    {/if}
  </div>
{:else}
  <div class="flex min-w-0 items-baseline gap-x-2">
    <svelte:element
      this={tag}
      href={url}
      {download}
      title={named}
      class="flex min-w-0 font-semibold"
      ><span class="truncate">{cut.head}</span><span
        class="shrink-0 whitespace-pre">{cut.end}</span
      ></svelte:element
    >
    {#if size !== undefined}
      <span class="shrink-0 whitespace-nowrap">{size}</span>
    {/if}
  </div>
{/if}
