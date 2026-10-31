<script lang="ts">
  import type { BatchAction, Item } from "@notemap/client";

  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import { askingFor, saidFor, type Supplied } from "$lib/asked";
  import { client } from "$lib/client";
  import { tagged } from "$lib/firing";
  import { offerable, triggeredBy } from "$lib/templates";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";

  import type { Editing } from "./editing.svelte";

  /** `addable` is the selected row's: a `+` on every row is a `+` nobody reads. */
  let {
    item,
    filter = [],
    addable = false,
    stacked = true,
    editing,
    fixed = false,
    onbatch,
  }: {
    item: Item;
    filter?: readonly string[];
    addable?: boolean;
    /** One to a line on a narrow screen, as a rail holds them; a line of their own does not. */
    stacked?: boolean;
    /** Open where the capture is being edited, which holds a trigger tag until the save. */
    editing?: Editing;
    /** Shown but not changed: a row left out of the batch being marked. */
    fixed?: boolean;
    /** A row marked for a batch: what is added or taken off here is for every marked row. */
    onbatch?: (action: BatchAction) => void;
  } = $props();

  let set = $state<TagSet | undefined>(undefined);

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
  function take(name: string, supplied?: Supplied): void {
    if (onbatch !== undefined) {
      onbatch({
        kind: "tag",
        tag: name,
        ...(supplied === undefined ? {} : { arguments: { ...supplied } }),
      });
    } else if (editing !== undefined && name.startsWith(TRIGGER_NAMESPACE)) {
      editing.wait(name, supplied);
    } else {
      void tagged(item.id, name, supplied);
    }
  }

  function drop(name: string): void {
    if (onbatch !== undefined) onbatch({ kind: "untag", tag: name });
    else if (waiting.includes(name)) editing?.unwait(name);
    else void client.untag(item.id, name);
  }
</script>

<div
  class="relative -ml-tag flex min-w-0 flex-wrap items-baseline {stacked
    ? 'max-narrow:flex-col max-narrow:items-start'
    : ''}"
>
  <TagSet
    bind:this={set}
    {names}
    {offered}
    {addable}
    {fixed}
    label={onbatch === undefined ? undefined : "Add a tag to every marked note"}
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
    ask={askingFor}
    besides={(name) =>
      waiting.includes(name) ? saidFor(name, editing?.given[name]) : undefined}
    onadd={take}
    onremove={drop}
  />
</div>
