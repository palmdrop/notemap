<script lang="ts">
  import type { Snippet } from "svelte";

  import Asking from "$components/primitives/marks/Asking.svelte";

  /**
   * A control's label, and the asking mark in the same cell while `working`:
   * the wider of the two sets the width, so the control never changes size.
   */
  let { working, children }: { working: boolean; children: Snippet } = $props();

  let marked = $state(false);

  $effect(() => {
    if (!working) marked = false;
  });
</script>

{#if working}
  <span class="inline-grid justify-items-center">
    <span
      class="col-start-1 row-start-1 {marked ? 'invisible' : ''}"
      aria-hidden={marked}
    >
      {@render children()}
    </span>
    <span class="col-start-1 row-start-1">
      <Asking bind:shown={marked} />
    </span>
  </span>
{:else}
  {@render children()}
{/if}
