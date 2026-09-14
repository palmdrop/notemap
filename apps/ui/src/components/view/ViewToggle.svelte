<script lang="ts">
  import type { View } from "$lib/view";

  /** The two ways of reading one list, the current one bold. */
  let { view, onchoose }: { view: View; onchoose: (view: View) => void } =
    $props();

  const VIEWS: readonly View[] = ["timeline", "index"];
</script>

<nav class="flex gap-4" aria-label="View">
  {#each VIEWS as one (one)}
    <button
      type="button"
      aria-pressed={view === one}
      onclick={() => onchoose(one)}
      class="hover:underline {view === one ? 'font-semibold' : ''}"
    >
      {one}
    </button>
  {/each}
</nav>
