<script lang="ts">
  import { page } from "$app/state";

  import Menu from "$components/settings/Menu.svelte";

  let { children } = $props();

  /** The menu alone, full width — the phone's landing page rather than a rail. */
  const atMenu = $derived(page.route.id === "/settings");
</script>

<div
  class="grid grid-cols-[var(--spacing-rail)_1fr] max-narrow:grid-cols-1 max-narrow:gap-0"
>
  <div
    class="border-r border-ink pt-5 pr-4 pb-12 max-narrow:border-r-0 max-narrow:pt-2 max-narrow:pr-0 max-narrow:pb-0
      {atMenu ? '' : 'max-narrow:hidden'}"
  >
    <Menu />
  </div>
  <div
    class="min-w-0 pt-5 pb-12 pl-gutter max-narrow:pt-3 max-narrow:pl-0
      {atMenu ? 'max-narrow:hidden' : ''}"
  >
    {@render children()}
  </div>
</div>
