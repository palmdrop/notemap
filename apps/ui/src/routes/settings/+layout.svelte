<script lang="ts">
  import { page } from "$app/state";

  import Menu from "$components/settings/Menu.svelte";

  let { children } = $props();

  /** The menu alone, full width — the phone's landing page rather than a rail. */
  const atMenu = $derived(page.route.id === "/settings");
</script>

<svelte:head>
  <title>Settings | Notemap</title>
</svelte:head>

<div
  class="grid grid-cols-[var(--spacing-rail)_1fr] max-wide:grid-cols-1 max-wide:gap-0"
>
  <div
    class="border-r border-ink pt-5 pr-4 pb-12 max-wide:border-r-0 max-wide:pt-2 max-wide:pr-0 max-wide:pb-0
      {atMenu ? '' : 'max-wide:hidden'}"
  >
    <Menu />
  </div>
  <div
    class="min-w-0 pt-5 pb-12 pl-gutter max-wide:pt-3 max-wide:pl-0
      {atMenu ? 'max-wide:hidden' : ''}"
  >
    {@render children()}
  </div>
</div>
