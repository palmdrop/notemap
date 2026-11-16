<script lang="ts">
  import { itemHref } from "$components/item/href";
  import Item from "$components/item/Item.svelte";
  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import { templateFromHref } from "$components/settings/href";
  import { copyable } from "$lib/clipboard";
  import { notices } from "$lib/notices.svelte";
  import { recordsOf } from "$lib/records.svelte";
  import { reachable } from "$lib/reachable.svelte";

  /**
   * A record's own address: the item's register, narrowed to the one record,
   * with the everyday ways at its bar — the item, Save as template, and Copy
   * path where the delivery named one. Withdraw stays in the record's own
   * band, apart from these.
   */
  let { item, record }: { item: string; record: string } = $props();

  const pool = reachable();
  const records = recordsOf(
    () => item,
    () => pool.yes,
  );
  const held = $derived(records.all.find((one) => one.id === record));
  const path = $derived(held?.pointer);
  const byHand = $derived(
    held?.target.kind === "destination" && held.applied === undefined,
  );

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      notices.raise({ what: "Copied", subject: text });
    } catch {
      notices.raise({ what: "could not copy the path", alarm: true });
    }
  }
</script>

<Item id={item} only={record} />

<div class="sticky bottom-0 z-20 -mx-3.5 mt-6 wide:-mx-8">
  <ActionBar label="Record">
    <BarAction icon="file" label="Item" href={itemHref(item)} />
    {#if byHand}
      <BarAction
        icon="template"
        label="Save as template"
        href={templateFromHref(item, record)}
      />
    {/if}
    {#if path !== undefined && copyable()}
      <BarAction
        icon="copy"
        label="Copy path"
        onclick={() => void copy(path)}
      />
    {/if}
  </ActionBar>
</div>
