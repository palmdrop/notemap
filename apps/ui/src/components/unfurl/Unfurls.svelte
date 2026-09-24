<script lang="ts">
  import { client } from "$lib/client";
  import { links } from "$lib/markdown";

  import Unfurl from "./Unfurl.svelte";

  /** What each link in `text` points at, while the pool setting says to read it. */
  let { text }: { text: string } = $props();

  const settings = client.settings.all;

  const on = $derived(
    $settings?.find((setting) => setting.name === "unfurl")?.value === true,
  );
  const urls = $derived(on ? links(text) : []);
</script>

{#if urls.length > 0}
  <div class="mt-2 flex flex-col gap-2">
    {#each urls as url (url)}
      <Unfurl {url} />
    {/each}
  </div>
{/if}
