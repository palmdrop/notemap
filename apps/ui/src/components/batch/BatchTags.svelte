<script lang="ts">
  import { onMount } from "svelte";
  import type { BatchAction, Item } from "@notemap/client";

  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import Sheet from "$components/primitives/sheets/Sheet.svelte";
  import { client } from "$lib/client";
  import { triggeredBy } from "$lib/templates";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";

  /**
   * The tags the selected rows carry, taken and added the way a row's are: a
   * tag typed or picked goes on every selected row at once, its × takes it
   * off every one. A tag on only some of them says how many, and pressing it
   * puts it on the rest. Trigger tags are routed, not tagged: the batch's
   * Route is where they are.
   */
  let {
    marked,
    onbatch,
    onclose,
  }: {
    marked: readonly Item[];
    onbatch: (action: BatchAction) => void;
    onclose: () => void;
  } = $props();

  let set = $state<TagSet | undefined>(undefined);

  const ordinary = (name: string): boolean =>
    triggeredBy(name) === undefined && !name.startsWith(TRIGGER_NAMESPACE);

  /** How many of the selected rows carry each tag they carry, the most carried first. */
  const counted = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const item of marked) {
      for (const tag of item.tags ?? []) {
        if (ordinary(tag.name)) counts[tag.name] = (counts[tag.name] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort(
      ([a, many], [b, more]) => more - many || a.localeCompare(b),
    );
  });

  const names = $derived(counted.map(([name]) => name));

  const inUse = client.tags.inUse;
  const offered = $derived($inUse.map((use) => use.name).filter(ordinary));

  function partly(name: string): string | undefined {
    const on = counted.find(([one]) => one === name)?.[1] ?? 0;
    return on === marked.length
      ? undefined
      : `${String(on)}/${String(marked.length)}`;
  }

  onMount(() => set?.add());
</script>

<Sheet title="tag {marked.length} selected" {onclose}>
  <div class="flex flex-wrap items-center gap-1 px-gutter py-4">
    <TagSet
      bind:this={set}
      {names}
      {offered}
      {partly}
      inline
      label="Add a tag to every selected item"
      onadd={(tag) => onbatch({ kind: "tag", tag })}
      onremove={(tag) => onbatch({ kind: "untag", tag })}
    />
  </div>
  <p class="m-0 px-gutter pb-3 text-small text-muted">
    A dashed tag is on some of them, and says how many: press it to put it on
    all. × takes a tag off all of them.
  </p>
  {#snippet foot()}
    <ActionBar at="foot" label="Tag">
      <BarAction icon="check" label="Done" primary onclick={onclose} />
    </ActionBar>
  {/snippet}
</Sheet>
