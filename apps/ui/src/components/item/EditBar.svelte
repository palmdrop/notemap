<script lang="ts">
  import type { Item } from "@notemap/client";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import { editable } from "$lib/lineage";

  import type { Editing } from "./editing.svelte";

  /** What an edit offers where the item's actions stood: Attach, Cancel and Save. */
  let { item, editing }: { item: Item; editing: Editing } = $props();

  let picker = $state<HTMLInputElement | undefined>(undefined);

  function pick(event: Event): void {
    const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    if (picker !== undefined) picker.value = "";
    if (files.length > 0) editing.pick(files);
  }
</script>

<ActionBar label="Editing">
  {#snippet say()}{#if !editable(item)}Sealed: saving makes a revision, and what
      was routed stays as it was.{/if}{/snippet}
  <BarAction
    icon="attach"
    label="Attach"
    disabled={editing.busy}
    onclick={() => picker?.click()}
  />
  <BarAction
    icon="close"
    label="Cancel"
    command="close"
    onclick={() => editing.close()}
  />
  <BarAction
    icon="check"
    label="Save"
    primary
    working={editing.busy}
    command="save"
    onclick={() => void editing.save()}
  />
</ActionBar>
<input
  bind:this={picker}
  type="file"
  multiple
  onchange={pick}
  aria-label="Files to carry"
  class="hidden"
/>
