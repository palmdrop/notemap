<script lang="ts">
  import { page } from "$app/state";

  import { setContext } from "svelte";

  import { QUIET } from "$components/primitives/blocks/Band.svelte";
  import Menu from "$components/settings/Menu.svelte";

  let { children } = $props();

  // Settings head their groups with quiet labels: the grey band is the
  // lists' day heading, and here it read as a button.
  setContext(QUIET, true);

  /** The list alone — the phone's landing page; when wide it lands on a section. */
  const atMenu = $derived(page.route.id === "/settings");
</script>

<svelte:head>
  <title>Settings | Notemap</title>
</svelte:head>

<!-- On a phone the list is a page and a section is pushed over it. When wide,
     at every width, the list is a column of its own beside the section, and
     the section's rows run to the window's edge as the log's do, what is in
     them kept to a readable measure. -->
<div
  class="grid grid-cols-1 wide:grid-cols-[var(--spacing-settings)_minmax(0,1fr)]"
>
  <div
    class="wide:sticky wide:top-bar wide:min-h-[calc(100dvh-var(--spacing-bar))] wide:self-start wide:border-r wide:border-rule {atMenu
      ? ''
      : 'max-wide:hidden'}"
  >
    <Menu />
  </div>
  <div
    class="min-w-0 wide:measured wide:[--pane-left:calc(var(--menu-left)+var(--spacing-settings))] {atMenu
      ? 'max-wide:hidden'
      : ''}"
  >
    {@render children()}
  </div>
</div>
