<script lang="ts">
  import type { Item } from "@notemap/client";

  import Actions from "$components/item/Actions.svelte";
  import Edit from "$components/item/Edit.svelte";
  import Payload from "$components/item/Payload.svelte";
  import Routing from "$components/item/Routing.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Pending from "$components/primitives/marks/Pending.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import type { Command } from "$lib/command/command";
  import { became, editable } from "$lib/lineage";
  import { recordsOf } from "$lib/records.svelte";

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
    commands,
    pending = false,
    onselect,
    onprocess,
  }: {
    item: Item;
    selected: boolean;
    offline: boolean;
    surface: "queue" | "feed";
    /** The surface's own list for this row, empty where it is not the selected one. */
    commands: readonly Command[];
    pending?: boolean;
    onselect: () => void;
    onprocess: () => void;
  } = $props();

  let editing = $state(false);
  let rail = $state<Rail | undefined>(undefined);
  let tags = $state<Tags | undefined>(undefined);

  // Only ever for the one row that is selected, and only where the item's
  // summary says there is something to read: a request per triage at the most.
  const records = recordsOf(
    () => (item.routing === undefined ? undefined : item.id),
    () => selected && !offline,
  );

  // Every row on the queue is unrouted, and a word saying so on each says
  // nothing; one held from an earlier read that the pool no longer counts as
  // work still wears what became of it.
  const finished = $derived(
    surface === "feed" ||
      item.archived !== undefined ||
      item.routing !== undefined ||
      item.revisedInto.length > 0,
  );
  const word = $derived(finished ? became(item) : undefined);
  const mayEdit = $derived(editable(item));

  // The box's foot is where `cancel` and `save` are, so a row that loses the
  // selection has no way out of the editable shape and must not be left in it.
  $effect(() => {
    if (!selected) editing = false;
  });

  /** Opens the tag chooser, for the key that asks for it. */
  export function tag(): void {
    tags?.add();
  }

  /** Toggles the capture into its editable shape, for the key that asks for it. */
  export function edit(): void {
    if (mayEdit) editing = !editing;
  }

  /** Leaves the editable shape, and says whether there was one to leave. */
  export function cancel(): boolean {
    if (!editing) return false;
    editing = false;
    return true;
  }

  /** Brings the row into view, for the keys that walk the list. */
  export function reveal(): void {
    rail?.reveal();
  }
</script>

<Rail bind:this={rail} {selected} onpick={onselect} onreach={onprocess}>
  <Stamp at={item.createdAt} opened={selected} onopen={onselect} />

  {#if word !== undefined}
    <StateWord {word} />
  {/if}

  {#if pending}
    <Pending />
  {/if}

  <div class="mt-0.5">
    <Tags bind:this={tags} {item} addable={selected} />
  </div>

  {#if finished}
    <Routing
      summary={item.routing}
      records={records.all}
      onundone={() => records.reread()}
    />
  {/if}

  {#if records.refused !== ""}
    <div role="status" class="mt-2 text-alarm">{records.refused}</div>
  {/if}
</Rail>

<Body {selected} onpick={onselect} onreach={onprocess}>
  {#if editing && mayEdit}
    <Edit {item} ondone={() => (editing = false)} />
  {:else}
    <Payload {item} />
  {/if}
</Body>

<!-- The box's foot, spanning both columns and closing the rail's rule. Every
     row reserves this height, selected or not, so selecting a row shifts
     nothing above or below it; unselected, the rail's rule runs through it. -->
{#if selected}
  <div
    class="col-span-full -mx-3 flex h-9 items-center border border-ink px-3 max-narrow:-mx-2 max-narrow:px-2"
  >
    <Actions {commands} />
  </div>
{:else}
  <div class="col-start-1 h-9 border-r border-ink"></div>
  <div class="col-start-2 h-9"></div>
{/if}
