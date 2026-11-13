<script lang="ts">
  import type { BatchAction, Item } from "@notemap/client";

  import Actions from "$components/item/Actions.svelte";
  import Edit from "$components/item/Edit.svelte";
  import EditFoot from "$components/item/EditFoot.svelte";
  import { Editing } from "$components/item/editing.svelte";
  import Payload from "$components/item/Payload.svelte";
  import Routing from "$components/item/Routing.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Box from "$components/primitives/blocks/Box.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Cached from "$components/primitives/marks/Cached.svelte";
  import Pending from "$components/primitives/marks/Pending.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import type { Command } from "$lib/command/command";
  import { width } from "$lib/breakpoint";
  import { became, editable } from "$lib/lineage";
  import { bringIntoView, fade, following, settled, slide } from "$lib/motion";
  import { pickedBy, type Picked } from "$lib/marking.svelte";
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
    marked = false,
    cursor = false,
    marking = false,
    onbatch,
    offline,
    surface,
    filter = [],
    terms = [],
    commands,
    pending = false,
    opens = false,
    cached = false,
    motion,
    onselect,
    onprocess,
  }: {
    item: Item;
    selected: boolean;
    /** Marked for a batch: its tags are every marked row's. */
    marked?: boolean;
    /** Where the keys are while rows are being marked. */
    cursor?: boolean;
    /** The surface is marking rows, and a row left out of it has its tags fixed. */
    marking?: boolean;
    /** What a marked row's tags are changed through. */
    onbatch?: (action: BatchAction) => void;
    offline: boolean;
    /** On the item's own surface, its records are drawn beneath the row rather than said in it. */
    surface: "queue" | "feed" | "item";
    /** The tags the surface is read through, marked where the row carries them. */
    filter?: readonly string[];
    /** The terms the surface is searched by, highlighted where the row's words hold them. */
    terms?: readonly string[];
    /** The surface's own list for this row, empty where it is not the selected one. */
    commands: readonly Command[];
    pending?: boolean;
    /** The first row under a heading, laying its top edge on the heading's rule. */
    opens?: boolean;
    /** Drawn from what this client holds rather than from the pool's answer. */
    cached?: boolean;
    /** Whether the list's latest change is one a read brought; absent, nothing moves. */
    motion?: { readonly still: boolean };
    /** Absent where the row is the whole surface, and there is nothing to select it from. */
    onselect?: (how: Picked) => void;
    onprocess?: () => void;
  } = $props();

  const routed = $derived(surface !== "item");

  let editing = $state<Editing | undefined>(undefined);
  let row = $state<HTMLElement | undefined>(undefined);
  let tags = $state<Tags | undefined>(undefined);

  /** The pointer is over the row, where a marked row offers its `+`. */
  let pointed = $state(false);

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
    if (row !== undefined) bringIntoView(row, { headFirst: true });
  }

  // A file attached or removed grows or shrinks the row where it stands, which
  // can carry the row past either edge of the screen.
  let attached: number | undefined;
  $effect(() => {
    const count = editing?.attachments.length;
    const was = attached;
    attached = count;
    if (count === undefined || was === undefined || count === was) return;
    const moving = row?.parentElement;
    if (moving != null) {
      void settled(moving).then(() => {
        if (row !== undefined) bringIntoView(row);
      });
    }
  });
</script>

{#snippet facts()}
  {#if word === "revision"}
    <span class="mt-2 block w-max" title="revision">
      <span aria-hidden="true">[+]</span>
      <span class="sr-only">revision</span>
    </span>
  {:else if word !== undefined}
    <StateWord {word} />
  {/if}

  {#if cached}
    <Cached />
  {/if}

  <div>
    <Tags
      bind:this={tags}
      {item}
      {filter}
      {editing}
      addable={selected || (marked && (cursor || pointed))}
      fixed={marking && !marked}
      onbatch={marked ? onbatch : undefined}
      stacked={false}
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
    <div role="status" class="mt-2 text-danger">{records.refused}</div>
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
  <!-- Where the pointer is decides whether a marked row offers its `+`, and,
       when wide, whether the row offers Route beside its words. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={row}
    data-row={item.id}
    data-marked={marked ? "" : undefined}
    data-opens={opens ? "" : undefined}
    data-headed=""
    onpointerenter={() => (pointed = true)}
    onpointerleave={() => (pointed = false)}
    class="relative col-span-full grid scroll-mt-day-head grid-cols-subgrid border-b border-rule transition-[background-color] duration-(--duration-short) ease-fade {selected
      ? 'bg-band'
      : pointed && width.wide && onprocess !== undefined
        ? 'bg-tag'
        : ''}"
  >
    <Rail {selected} {marked} {cursor} onpick={pick} onreach={reach}>
      <Stamp
        at={item.createdAt}
        dated={false}
        opened={selected}
        {marked}
        {marking}
        onopen={onselect === undefined
          ? undefined
          : (event) => pick?.(pickedBy(event))}
      />
    </Rail>

    <Body {selected} onpick={pick} onreach={reach}>
      {#if editing !== undefined}
        <Edit {editing} />
      {:else}
        <Payload {item} {terms} />
      {/if}
      {@render facts()}
    </Body>

    {#if pending}
      <!-- The waiting dot, in the row's corner. -->
      <span class="absolute top-5 right-gutter leading-none">
        <Pending since={undrainedSince(item.id)} inline />
      </span>
    {/if}

    {#if pointed && width.wide && !selected && !marking && reach !== undefined && surface === "queue"}
      <span class="absolute top-3 right-gutter" transition:fade>
        <Box icon="route" title="Route (p)" onclick={reach}>Route</Box>
      </span>
    {/if}

    {#if selected}
      <div
        data-foot
        class="col-span-full row-start-2 flex min-h-11 items-center border-t border-rule bg-off px-gutter"
        transition:fade
      >
        {#if editing !== undefined}
          <EditFoot {editing} />
        {:else}
          <Actions {commands} />
        {/if}
      </div>
    {/if}
  </div>
</div>
