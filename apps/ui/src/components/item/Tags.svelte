<script lang="ts">
  import type { Item } from "@notemap/client";

  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import { client } from "$lib/client";
  import { sayItFired } from "$lib/firing";
  import { offerable, triggeredBy } from "$lib/templates";

  /** `addable` is the selected row's: a `+` on every row is a `+` nobody reads. */
  let {
    item,
    filter = [],
    addable = false,
  }: { item: Item; filter?: readonly string[]; addable?: boolean } = $props();

  let set = $state<TagSet | undefined>(undefined);

  const names = $derived((item.tags ?? []).map((tag) => tag.name));

  const inUse = client.tags.inUse;
  const templates = client.templates.all;
  const offered = $derived(
    offerable(
      $inUse.map((use) => use.name),
      $templates,
    ),
  );

  export function add(): void {
    set?.add();
  }

  /** A trigger tag files the item, so what it did is said as soon as it is known. */
  async function tagged(id: string, name: string): Promise<void> {
    await client.tag(id, name);
    await sayItFired(id, name);
  }
</script>

<div
  class="flex min-w-0 flex-wrap items-baseline gap-x-[1ch] max-narrow:flex-col max-narrow:items-start"
>
  <TagSet
    bind:this={set}
    {names}
    {offered}
    {addable}
    marked={(name) => filter.includes(name)}
    fires={(name) => triggeredBy(name)?.name}
    held={(name) => {
      const template = triggeredBy(name);
      return (
        template !== undefined &&
        (item.routing?.templates ?? []).includes(template.id)
      );
    }}
    onadd={(name) => void tagged(item.id, name)}
    onremove={(name) => void client.untag(item.id, name)}
  />
</div>
