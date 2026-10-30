<script lang="ts">
  import type { BatchAction, Item } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import TagSet from "$components/primitives/controls/TagSet.svelte";
  import { askingFor } from "$lib/asked";
  import { notes } from "$lib/batching";
  import { client } from "$lib/client";
  import { offerable, triggeredBy } from "$lib/templates";

  /**
   * What the rows marked for a batch can be given, held in the list's head
   * while any are marked. The tags are every tag any of them carries, counted
   * where not all of them do: one added goes on every row that lacks it, one
   * taken off comes off every row that has it. `discard` is offered where
   * something marked is not discarded, `undiscard` where something is.
   */
  let {
    marked,
    onbatch,
    onall,
    onclear,
  }: {
    marked: readonly Item[];
    onbatch: (action: BatchAction) => void;
    onall: () => void;
    onclear: () => void;
  } = $props();

  /** By tag, how many of the marked rows carry it, in the order they are first met. */
  const carriers = $derived.by(() => {
    const by: Record<string, number> = {};
    for (const item of marked) {
      for (const tag of item.tags ?? []) {
        by[tag.name] = (by[tag.name] ?? 0) + 1;
      }
    }
    return by;
  });

  const inUse = client.tags.inUse;
  const templates = client.templates.all;
  const offered = $derived(
    offerable(
      $inUse.map((use) => use.name),
      $templates,
    ),
  );

  /** Every row carrying it was filed by the template it applies: there is nothing to take off. */
  function held(name: string): boolean {
    const template = triggeredBy(name);
    if (template === undefined) return false;
    return marked
      .filter((item) => (item.tags ?? []).some((tag) => tag.name === name))
      .every((item) => (item.routing?.templates ?? []).includes(template.id));
  }

  const discardable = $derived(
    marked.some((item) => item.archived === undefined),
  );
  const undiscardable = $derived(
    marked.some((item) => item.archived !== undefined),
  );
</script>

<span class="whitespace-nowrap">{notes(marked.length)} marked</span>

<div class="relative -ml-tag flex min-w-0 flex-wrap items-baseline">
  <TagSet
    names={Object.keys(carriers)}
    {offered}
    label="Add a tag to every marked note"
    fires={(name) => triggeredBy(name)?.name}
    {held}
    ask={askingFor}
    besides={(name) => {
      const count = carriers[name] ?? 0;
      return count === marked.length
        ? undefined
        : `${String(count)}/${String(marked.length)}`;
    }}
    onadd={(tag, supplied) =>
      onbatch({
        kind: "tag",
        tag,
        ...(supplied === undefined ? {} : { arguments: { ...supplied } }),
      })}
    onremove={(tag) => onbatch({ kind: "untag", tag })}
  />
</div>

{#if discardable}
  <Action alarm onclick={() => onbatch({ kind: "archive" })}>discard</Action>
{/if}
{#if undiscardable}
  <Action onclick={() => onbatch({ kind: "unarchive" })}>undiscard</Action>
{/if}
<Action onclick={onall}>all</Action>
<Action onclick={onclear}>clear</Action>
