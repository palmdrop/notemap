<script lang="ts">
  import Action from "$components/primitives/controls/Action.svelte";
  import { slide } from "$lib/motion";

  import type { Editing } from "./editing.svelte";

  /** What an edit offers, where the item's actions stood. */
  let { editing }: { editing: Editing } = $props();

  let picker: HTMLInputElement;

  async function pick(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file === undefined) return;
    try {
      await editing.pick(file);
    } finally {
      picker.value = "";
    }
  }
</script>

<div
  class="flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-5"
>
  <div class="flex flex-wrap items-baseline gap-x-5 max-narrow:gap-x-3">
    <Action onclick={() => editing.close()}>close</Action>
    {#if editing.changed}
      <!-- The gap before it is its own, so the whole of it slides and `attach`
           moves with it rather than jumping the gap first. -->
      <span
        class="-ml-5 pl-5 whitespace-nowrap max-narrow:-ml-3 max-narrow:pl-3"
        transition:slide={{ axis: "x", fade: true, magnitude: "short" }}
      >
        <Action onclick={() => editing.revert()}>revert</Action>
      </span>
    {/if}
    <Action disabled={editing.busy} onclick={() => picker.click()}>
      attach
    </Action>
  </div>

  <Action primary working={editing.busy} onclick={() => void editing.save()}
    >save</Action
  >

  <input
    bind:this={picker}
    type="file"
    accept="image/*"
    onchange={pick}
    aria-label="A picture to carry"
    class="hidden"
  />
</div>
