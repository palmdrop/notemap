<script lang="ts">
  import { client } from "$lib/client";
  import { links } from "$lib/markdown";
  import { reachable } from "$lib/reachable.svelte";

  import Unfurl from "./Unfurl.svelte";

  /**
   * What each link in `text` points at, while the pool setting says to read it
   * and the pool answers.
   */
  let { text }: { text: string } = $props();

  const settings = client.settings.all;
  const pool = reachable();

  const on = $derived(
    $settings?.find((setting) => setting.name === "unfurl")?.value === true,
  );
  const urls = $derived(on && pool.yes ? links(text) : []);
</script>

{#if urls.length > 0}
  <div class="flex flex-col">
    {#each urls as url (url)}
      <Unfurl {url} />
    {/each}
  </div>
{/if}
