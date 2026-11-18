<script lang="ts">
  import { page } from "$app/state";

  import Menu from "$components/settings/Menu.svelte";
  import { width } from "$lib/breakpoint";

  let { children } = $props();

  /** The menu alone, full width — the phone's landing page rather than a rail. */
  const atMenu = $derived(page.route.id === "/settings");
  /** With the whole menu drawn, the sections hang in it, and the page is the rest. */
  const inMenu = $derived(width.full);
</script>

<svelte:head>
  <title>Settings | Notemap</title>
</svelte:head>

{#if inMenu}
  <div class="max-w-read min-w-0">
    {#if atMenu}
      <Menu />
    {:else}
      {@render children()}
    {/if}
  </div>
{:else}
  <div
    class="grid grid-cols-[14rem_minmax(0,var(--spacing-read))] max-wide:grid-cols-1 max-wide:gap-0"
  >
    <div
      class="border-r border-rule max-wide:border-r-0
        {atMenu ? '' : 'max-wide:hidden'}"
    >
      <Menu />
    </div>
    <div class="min-w-0 {atMenu ? 'max-wide:hidden' : ''}">
      {@render children()}
    </div>
  </div>
{/if}
