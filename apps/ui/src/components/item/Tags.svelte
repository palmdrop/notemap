<script lang="ts">
  import type { Item } from "@notemap/client";

  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import { client } from "$lib/client";
  import { tagged } from "$lib/firing";
  import { offerable, triggeredBy } from "$lib/templates";

  import type { Editing } from "./editing.svelte";

  /** `addable` is the selected row's: a `+` on every row is a `+` nobody reads. */
  let {
    item,
    filter = [],
    addable = false,
    stacked = true,
    editing,
  }: {
    item: Item;
    filter?: readonly string[];
    addable?: boolean;
    /** One to a line on a narrow screen, as a rail holds them; a line of their own does not. */
    stacked?: boolean;
    /** Open where the capture is being edited, which holds a trigger tag until the save. */
    editing?: Editing;
  } = $props();

  let set = $state<TagSet | undefined>(undefined);

  const NAMESPACE = "route/";

  const carried = $derived((item.tags ?? []).map((tag) => tag.name));
  const waiting = $derived(editing?.waiting ?? []);
  const names = $derived([
    ...carried,
    ...waiting.filter((name) => !carried.includes(name)),
  ]);

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

  /** A trigger tag files the item, so one taken mid-edit files what the save says. */
  function take(name: string): void {
    if (editing !== undefined && name.startsWith(NAMESPACE)) {
      editing.wait(name);
    } else {
      void tagged(item.id, name);
    }
  }

  function drop(name: string): void {
    if (waiting.includes(name)) editing?.unwait(name);
    else void client.untag(item.id, name);
  }
</script>

<div
  class="flex min-w-0 flex-wrap items-baseline gap-x-[1ch] {stacked
    ? 'max-narrow:flex-col max-narrow:items-start'
    : ''}"
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
    waiting={(name) => waiting.includes(name)}
    onadd={take}
    onremove={drop}
  />
</div>
