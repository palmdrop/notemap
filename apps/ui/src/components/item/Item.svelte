<script lang="ts">
  import { quick } from "$lib/quicking.svelte";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { goto } from "$app/navigation";
  import { saidBy, type ItemState } from "@notemap/client";

  import Edit from "$components/item/Edit.svelte";
  import { Editing } from "$components/item/editing.svelte";
  import ItemBar from "$components/item/ItemBar.svelte";
  import Payload from "$components/item/Payload.svelte";
  import Routing from "$components/item/Routing.svelte";
  import Tags from "$components/item/Tags.svelte";
  import Windowed from "$components/item/Windowed.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Cached from "$components/primitives/marks/Cached.svelte";
  import Pending from "$components/primitives/marks/Pending.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { width } from "$lib/breakpoint";
  import { client } from "$lib/client";
  import { commandsFor, whileEditing } from "$lib/command/item";
  import { publish } from "$lib/command/stack.svelte";
  import { firings } from "$lib/firings.svelte";
  import { notices } from "$lib/notices.svelte";
  import { cancelledKey, keyFor } from "$lib/routing";
  import { pending } from "$lib/pending.svelte";
  import { doubled } from "$lib/pick";
  import { reachable } from "$lib/reachable.svelte";
  import { recordsOf } from "$lib/records.svelte";
  import { NO_ITEM_OFFLINE, NO_RECORDS_OFFLINE, NO_SUCH_ITEM } from "$lib/said";
  import { undrainedSince } from "$lib/undrained-since";

  import { itemHref } from "./href";
  import { walkOf } from "./walk.svelte";

  /**
   * The item read on its own: a route in its window, where it went as a box
   * of rows each opening its record, the words whole, its tags, and its
   * actions in a bar. Done and Discard move on to the next item in its list,
   * whose bar then says what was done, with Undo.
   */
  let { id }: { id: string } = $props();

  const pool = reachable();
  const undrained = pending();
  const walk = walkOf(() => id);

  let read = $state<ItemState | undefined>(undefined);
  let editing = $state<Editing | undefined>(undefined);
  let tags = $state<Tags | undefined>(undefined);

  // The read settles what is drawn and what it was drawn from; the item itself
  // is then the client's held copy, so an archive made here marks it at once.
  const held = $derived(client.held(id));
  const item = $derived($held);

  /**
   * Records this view has drawn standing. A withdrawn record is drawn only if
   * it is one of them — withdrawn while the person was here — and read again
   * later it is left out.
   */
  const standing = new SvelteSet<string>();

  // An item that was never routed has no records to read, unless one this
  // view drew has been withdrawn since.
  const records = recordsOf(
    () =>
      item !== undefined &&
      (item.routing !== undefined || untrack(() => standing.size > 0))
        ? item.id
        : undefined,
    () => pool.yes,
  );

  $effect(() => {
    for (const record of records.all) {
      if (record.withdrawnAt === undefined) standing.add(record.id);
    }
  });

  $effect(() => {
    const wanted = id;
    read = undefined;
    editing = undefined;
    untrack(() => standing.clear());

    void (async () => {
      const answer = await client.item(wanted);
      if (wanted === id) read = answer;
    })();
  });

  /** A sealed item is edited by revising it; a discarded one is undiscarded first. */
  const mayEdit = $derived(item !== undefined && item.archived === undefined);

  function edit(): void {
    if (item !== undefined && mayEdit && editing === undefined) {
      editing = new Editing(item, () => (editing = undefined));
    }
  }

  /** On to the next item in its list, or back to the list where it was the last. */
  function moveOn(): void {
    const next = walk.next;
    void goto(next === undefined ? walk.home : itemHref(next.id), {
      replaceState: true,
    });
  }

  // One subject and no selection: the page is the item, so what it offers is
  // what its own bar draws, built once and published as it stands. No
  // address — this surface is where `open` would lead.
  const commands = $derived.by(() => {
    if (item === undefined) return [];
    return commandsFor(item, {
      revises: true,
      offline: !pool.yes,
      onprocess: () => quick.open(id),
      onedit: edit,
      tag: () => tags?.add(),
    }).map((command) =>
      (command.id === "manual" || command.id === "discard") && "run" in command
        ? {
            ...command,
            run: async () => {
              await command.run();
              moveOn();
            },
          }
        : command,
    );
  });

  publish(() => (editing !== undefined ? whileEditing(commands) : commands));

  const refused = $derived(
    read?.failure?.refused === true ? read.failure.said : undefined,
  );

  const drawn = $derived(
    records.all.filter(
      (record) => record.withdrawnAt === undefined || standing.has(record.id),
    ),
  );

  const firing = $derived(firings.open.find((one) => one.item === id));

  /** The manual mark standing on the item, which its box takes back. */
  const marked = $derived(
    drawn.find(
      (record) =>
        record.target.kind === "user" && record.withdrawnAt === undefined,
    ),
  );

  async function undoManual(): Promise<void> {
    if (marked === undefined) return;
    try {
      await client.routing.cancel(marked.id, marked.item);
      notices.settled(keyFor(marked.id));
      notices.mark(cancelledKey(marked.id));
      records.reread();
    } catch (error) {
      notices.raise({ what: saidBy(error), alarm: true });
    }
  }

  /** What the records box says instead of records, where it has none to say. */
  const aboutRecords = $derived.by(() => {
    if (item?.routing === undefined) return undefined;
    if (records.refused !== "") return { said: records.refused, alarm: true };
    if (drawn.length > 0) return undefined;
    if (!pool.yes) return { said: NO_RECORDS_OFFLINE, alarm: false };
    if (!records.settled) return { said: "", alarm: false, asking: true };
    return undefined;
  });
</script>

{#if item !== undefined && width.wide}
  <div class="-mx-8">
    <ItemBar
      {item}
      {commands}
      {editing}
      onundomanual={marked === undefined ? undefined : () => void undoManual()}
    />
  </div>
{/if}

<div
  class="-mx-3.5 flex min-h-[calc(100dvh-var(--spacing-bar)-4rem)] flex-col gap-4 px-gutter pt-4 pb-4 wide:-mx-8 wide:min-h-0 wide:px-5"
>
  {#if item !== undefined}
    <div class="flex max-w-read flex-col gap-4">
      {#if firing !== undefined}
        <Windowed {firing} offline={!pool.yes} />
      {/if}

      <Routing
        boxed
        summary={item.routing}
        records={drawn}
        onundone={() => records.reread()}
      />
      {#if aboutRecords !== undefined}
        {#if aboutRecords.asking === true}
          <Asking />
        {:else if aboutRecords.alarm}
          <div role="status" class="text-danger">{aboutRecords.said}</div>
        {:else}
          <div>{aboutRecords.said}</div>
        {/if}
      {/if}

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex flex-col gap-3 text-read"
        ondblclick={editing === undefined && mayEdit
          ? doubled(edit)
          : undefined}
      >
        {#if editing !== undefined}
          <Edit {editing} />
        {:else}
          <Payload {item} whole />
        {/if}
      </div>

      {#if read?.fromCache === true || undrained.has(item.id)}
        <p class="flex items-center gap-3 text-small text-muted">
          {#if read?.fromCache === true}<Cached inline />{/if}
          {#if undrained.has(item.id)}
            <Pending since={undrainedSince(item.id)} inline />
          {/if}
        </p>
      {/if}
    </div>

    <div class="mt-auto flex max-w-read flex-wrap items-center gap-1">
      <Tags
        bind:this={tags}
        {item}
        {editing}
        addable={item.archived === undefined}
        stacked={false}
      />
    </div>
  {:else if read !== undefined}
    {#if refused !== undefined}
      <div role="status" class="text-danger">{refused}</div>
    {:else if read.failure !== undefined}
      <div>{NO_ITEM_OFFLINE}</div>
    {:else}
      <p class="text-small text-muted">gone</p>
      <Prose text={NO_SUCH_ITEM} />
    {/if}
  {:else}
    <Asking />
  {/if}
</div>

{#if item !== undefined && !width.wide}
  <div class="sticky bottom-0 z-20 -mx-3.5">
    <ItemBar
      {item}
      {commands}
      {editing}
      onundomanual={marked === undefined ? undefined : () => void undoManual()}
    />
  </div>
{/if}
