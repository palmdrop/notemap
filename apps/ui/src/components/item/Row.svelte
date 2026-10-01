<script lang="ts">
  import type { Item } from "@notemap/client";

  import Actions from "$components/item/Actions.svelte";
  import Edit from "$components/item/Edit.svelte";
  import EditFoot from "$components/item/EditFoot.svelte";
  import { Editing } from "$components/item/editing.svelte";
  import Payload from "$components/item/Payload.svelte";
  import Routing from "$components/item/Routing.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Cached from "$components/primitives/marks/Cached.svelte";
  import Pending from "$components/primitives/marks/Pending.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import type { Command } from "$lib/command/command";
  import type { Layout } from "$lib/rows.svelte";
  import { became, editable } from "$lib/lineage";
  import { fade, following, slide } from "$lib/motion";
  import { recordsOf } from "$lib/records.svelte";
  import { undrainedSince } from "$lib/undrained-since";

  /**
   * One row, on either register. The queue's says nothing about what became
   * of an item, every row on it being unrouted; the feed's says it in a word
   * where there is one, and in a line saying where it went.
   */
  let {
    item,
    selected,
    offline,
    surface,
    filter = [],
    commands,
    pending = false,
    layout = "rail",
    opens = false,
    cached = false,
    motion,
    onselect,
    onprocess,
  }: {
    item: Item;
    selected: boolean;
    offline: boolean;
    /** On the item's own surface, its records are drawn beneath the row rather than said in it. */
    surface: "queue" | "feed" | "item";
    /** The tags the surface is read through, marked where the row carries them. */
    filter?: readonly string[];
    /** The surface's own list for this row, empty where it is not the selected one. */
    commands: readonly Command[];
    pending?: boolean;
    /** By day, the stamp says only the time; slim, the rail holds nothing else. */
    layout?: Layout;
    /** The first row under a heading, laying its top edge on the heading's rule. */
    opens?: boolean;
    /** Drawn from what this client holds rather than from the pool's answer. */
    cached?: boolean;
    /** Whether the list's latest change is one a read brought; absent, nothing moves. */
    motion?: { readonly still: boolean };
    /** Absent where the row is the whole surface, and there is nothing to select it from. */
    onselect?: () => void;
    onprocess?: () => void;
  } = $props();

  const byDay = $derived(layout !== "rail");
  const slim = $derived(layout === "slim");
  const routed = $derived(surface !== "item");

  let editing = $state<Editing | undefined>(undefined);
  let rail = $state<Rail | undefined>(undefined);
  let tags = $state<Tags | undefined>(undefined);

  // Only ever for the one row that is selected, and only where the item's
  // summary says there is something to read: a request per triage at the most.
  const records = recordsOf(
    () => (item.routing === undefined ? undefined : item.id),
    () => routed && selected && !offline,
  );

  // Every row on the queue is unrouted, and a word saying so on each says
  // nothing; one held from an earlier read that the pool no longer counts as
  // work still wears what became of it.
  const finished = $derived(
    surface !== "queue" ||
      item.archived !== undefined ||
      item.routing !== undefined ||
      item.revisedInto.length > 0,
  );
  const word = $derived(finished ? became(item) : undefined);
  const mayEdit = $derived(editable(item));

  // The box's foot is where `close` and `save` are, so a row that loses the
  // selection has no way out of the editable shape and must not be left in it.
  $effect(() => {
    if (!selected || !mayEdit) editing = undefined;
  });

  /** Opens the tag chooser, for the key that asks for it. */
  export function tag(): void {
    tags?.add();
  }

  /** Opens the capture's editable shape, for the key that asks for it. */
  export function edit(): void {
    if (mayEdit && editing === undefined) {
      editing = new Editing(item, () => (editing = undefined));
    }
  }

  /** Whether the capture is drawn as its field, for the surface deciding what a key reaches. */
  export function isEditing(): boolean {
    return editing !== undefined;
  }

  /** A row being rewritten is not picked, nor processed, until that is left. */
  const pick = $derived(editing === undefined ? onselect : undefined);
  const reach = $derived(editing === undefined ? onprocess : undefined);

  /** Brings the row into view, for the keys that walk the list. */
  export function reveal(): void {
    rail?.reveal();
  }
</script>

{#snippet facts()}
  {#if word !== undefined}
    <StateWord {word} />
  {/if}

  {#if pending}
    <Pending since={undrainedSince(item.id)} />
  {/if}

  {#if cached}
    <Cached />
  {/if}

  <div class={slim ? "" : "mt-0.5"}>
    <Tags
      bind:this={tags}
      {item}
      {filter}
      {editing}
      addable={selected}
      stacked={!slim}
    />
  </div>

  {#if finished && routed}
    <Routing
      summary={item.routing}
      records={records.all}
      onundone={() => records.reread()}
    />
  {/if}

  {#if records.refused !== ""}
    <div role="status" class="mt-2 text-alarm">{records.refused}</div>
  {/if}
{/snippet}

<!-- One element on the register's own tracks, so the row has a height of its
     own and the columns stay in register with every other row: the outer box
     is what moves, the inner what its height follows. -->
<div
  class="col-span-full grid grid-cols-subgrid"
  transition:slide={{ fade: true, still: motion?.still ?? true }}
  {@attach following}
>
  <div
    data-row
    data-opens={opens ? "" : undefined}
    class="col-span-full grid grid-cols-subgrid {opens ? '-mt-px' : ''}"
  >
    <Rail
      bind:this={rail}
      {selected}
      headed={byDay || surface !== "item"}
      onpick={pick}
      onreach={reach}
    >
      <Stamp
        at={item.createdAt}
        dated={!byDay}
        opened={selected}
        onopen={onselect === undefined ? undefined : () => pick?.()}
      />

      {#if !slim}
        {@render facts()}
      {/if}
    </Rail>

    <Body {selected} onpick={pick} onreach={reach}>
      {#if editing !== undefined}
        <Edit {editing} />
      {:else}
        <Payload {item} />
      {/if}
      {#if slim}
        <div class="mt-1">
          {@render facts()}
        </div>
      {/if}
    </Body>

    <!-- The box's foot, spanning both columns and closing the rail's rule. Every
         row reserves this height, selected or not, so selecting a row shifts
         nothing above or below it; unselected, the rail's rule runs through it. -->
    {#if selected}
      <div
        data-foot
        class="col-span-full row-start-2 -mx-3 flex h-9 items-center border border-ink px-3 max-narrow:-mx-2 max-narrow:px-2"
        transition:fade
      >
        {#if editing !== undefined}
          <EditFoot {editing} />
        {:else}
          <Actions {commands} />
        {/if}
      </div>
    {:else}
      <div class="col-start-1 row-start-2 h-9 rule-right" transition:fade></div>
      <div class="col-start-2 row-start-2 h-9"></div>
    {/if}
  </div>
</div>
