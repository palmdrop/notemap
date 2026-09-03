<script lang="ts">
  import type { Item } from "@notemap/client";

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
  import { leaving } from "$lib/leaving.svelte";
  import { became, editable, finished } from "$lib/lineage";
  import { recordsOf } from "$lib/records.svelte";
  import { briefly } from "$lib/stamp";

  let {
    item,
    opened,
    offline,
    furled,
    pending = false,
    before,
    onopen,
    onroute,
  }: {
    item: Item;
    opened: boolean;
    offline: boolean;
    furled: boolean;
    pending?: boolean;
    /** The row under this one, so a departure goes from where it stood. */
    before?: string;
    onopen: () => void;
    onroute: () => void;
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

<Rail lit={opened} onpick={onopen}>
  {#if !furled}
    <Stamp at={item.createdAt} {opened} onopen={() => onopen()} />
  {/if}

  {#if !furled && word !== undefined}
    <StateWord {word} />
  {/if}

  {#if !furled && pending}
    <Pending />
  {/if}

  <Tags {item} />
  <Routing summary={item.routing} records={records.all} />

  {#if records.refused !== ""}
    <div role="status" class="mt-2 text-accent">{records.refused}</div>
  {/if}

  {#if opened}
    <Facts>
      <Fact name="payload">{item.payload.type}</Fact>
      <Fact name="edited" empty={item.contentUpdatedAt === undefined}>
        {item.contentUpdatedAt === undefined
          ? "not since capture"
          : briefly(item.contentUpdatedAt)}
      </Fact>
    </Facts>
  {/if}
</Rail>

<Body lit={opened} onpick={onopen}>
  {#if furled}
    <div class="mb-2 flex flex-wrap items-baseline gap-3 font-mono">
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
    <Payload {item} muted={finished(item)} />
  {/if}

  {#if opened}
    <Actions
      {item}
      {offline}
      address={itemHref(item.id)}
      onroute={() => onroute()}
      onedit={() => (editing = !editing)}
      onwent={(word) => leaving.after(item, word, before)}
    />
  {/if}
</Body>
