<script lang="ts">
  import type { Item } from "@notemap/client";

  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import { client } from "$lib/client";
  import { sayItFired } from "$lib/firing";
  import { offerable, triggeredBy } from "$lib/templates";

  let { item }: { item: Item } = $props();

  const names = $derived((item.tags ?? []).map((tag) => tag.name));

  const inUse = client.tags.inUse;
  const offered = $derived(offerable($inUse.map((use) => use.name)));

  /** A trigger tag files the item, so what it did is said as soon as it is known. */
  async function tagged(id: string, name: string): Promise<void> {
    await client.tag(id, name);
    await sayItFired(id, name);
  }
</script>

<div class="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-4">
  <TagSet
    {names}
    {offered}
    fires={(name) => triggeredBy(name)?.name}
    onadd={(name) => void tagged(item.id, name)}
    onremove={(name) => void client.untag(item.id, name)}
  />
</div>
