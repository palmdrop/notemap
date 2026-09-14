<script lang="ts">
  import type { Item } from "@notemap/client";

  import { goto } from "$app/navigation";

  import Actions from "$components/item/Actions.svelte";
  import Edit from "$components/item/Edit.svelte";
  import Payload from "$components/item/Payload.svelte";
  import Routing from "$components/item/Routing.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Fact from "$components/primitives/register/Fact.svelte";
  import Facts from "$components/primitives/register/Facts.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Pending from "$components/primitives/marks/Pending.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { itemHref } from "$components/item/href";
  import { became, editable } from "$lib/lineage";
  import { recordsOf } from "$lib/records.svelte";
  import { briefly } from "$lib/stamp";

  /**
   * One row, on either register. What a surface offers it differs — a departure
   * to go from, a composer to open — and which surface it is does not.
   */
  let {
    item,
    opened,
    offline,
    furled,
    first = false,
    pending = false,
    onopen,
    onprocess,
  }: {
    item: Item;
    opened: boolean;
    offline: boolean;
    furled: boolean;
    first?: boolean;
    pending?: boolean;
    onopen: () => void;
    onprocess: () => void;
  } = $props();

  let editing = $state(false);

  // Only ever for the one row that is open, and only where the item's summary
  // says there is something to read: a request per triage at the very most.
  const records = recordsOf(
    () => (item.routing === undefined ? undefined : item.id),
    () => opened && !offline,
  );

  const word = $derived(became(item));
  const mayEdit = $derived(editable(item));
</script>

<Rail
  {first}
  lit={opened}
  onpick={onopen}
  onreach={() => void goto(itemHref(item.id))}
>
  {#if !furled}
    <Stamp at={item.createdAt} {opened} onopen={() => onopen()} />

    {#if word !== undefined}
      <StateWord {word} />
    {/if}

    {#if pending}
      <Pending />
    {/if}
  {/if}

  <Tags {item} />
  <Routing
    summary={item.routing}
    records={records.all}
    onundone={() => records.reread()}
  />

  {#if records.refused !== ""}
    <div role="status" class="mt-2 text-alarm">{records.refused}</div>
  {/if}

  <!-- What it is, the capture says; what a fact answers is what it cannot. -->
  {#if opened && item.contentUpdatedAt !== undefined}
    <Facts>
      <Fact name="edited">{briefly(item.contentUpdatedAt)}</Fact>
    </Facts>
  {/if}
</Rail>

<Body
  {first}
  lit={opened}
  onpick={onopen}
  onreach={() => void goto(itemHref(item.id))}
>
  {#if furled}
    <div class="mb-2 flex flex-wrap items-baseline gap-3">
      <Stamp at={item.createdAt} {opened} onopen={() => onopen()} />

      {#if word !== undefined}
        <StateWord {word} inline />
      {/if}

      {#if pending}
        <Pending inline />
      {/if}
    </div>
  {/if}

  {#if editing && mayEdit}
    <Edit {item} ondone={() => (editing = false)} />
  {:else}
    <Payload {item} />
  {/if}

  {#if opened}
    <Actions
      {item}
      address={itemHref(item.id)}
      onprocess={() => onprocess()}
      onedit={() => (editing = !editing)}
    />
  {/if}
</Body>
