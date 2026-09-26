<script lang="ts">
  import Action from "$components/primitives/controls/Action.svelte";

  import type { Rewrite } from "./rewrite.svelte";

  /** What a rewrite offers, where the item's actions stood: nothing else is reached until it is left. */
  let { rewrite }: { rewrite: Rewrite } = $props();

  let picker: HTMLInputElement;

  async function pick(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file === undefined) return;
    try {
      await rewrite.pick(file);
    } finally {
      picker.value = "";
    }
  }
</script>

<div
  class="flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-5"
>
  <div class="flex flex-wrap items-baseline gap-x-5 max-narrow:gap-x-3">
    <Action onclick={() => rewrite.cancel()}>cancel</Action>
    <Action disabled={rewrite.busy} onclick={() => picker.click()}>
      attach
    </Action>
  </div>

  <Action primary working={rewrite.busy} onclick={() => rewrite.save()}
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
