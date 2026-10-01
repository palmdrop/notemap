<script lang="ts">
  import {
    saidBy,
    type RoutingRecord,
    type RoutingSummary,
  } from "@notemap/client";

  import { recordHref } from "$components/item/href";
  import Turning from "$components/primitives/marks/Turning.svelte";
  import { client } from "$lib/client";
  import { described, readingHeld } from "$lib/described.svelte";
  import { nameFor } from "$lib/names.svelte";
  import { resolve } from "$lib/naming";
  import { notices } from "$lib/notices.svelte";
  import {
    cancelledKey,
    keyFor,
    wentTo,
    wentWhere,
    type Went,
  } from "$lib/routing";

  /** The records say more than the summary, and only a surface that read them has them. */
  let {
    summary,
    records = [],
    short = false,
    onundone,
  }: {
    summary: RoutingSummary | undefined;
    records?: readonly RoutingRecord[];
    /** Every record on one line, cut where it runs out of room, and nothing to press. */
    short?: boolean;
    /** A cancelled record leaves what was read of them out of date. */
    onundone?: () => void;
  } = $props();

  let said = $state("");

  const destinations = client.destinations.all;

  /** An id says nothing a person can read, so an unread destination is unnamed. */
  const nameOf = $derived(
    (id: string) =>
      $destinations.find((one) => one.id === id)?.name ?? "a destination",
  );

  /**
   * What each record's arguments are called, asked once and kept: a row drawing
   * `12345` says nothing about where the capture went. Only the records, since
   * a summary carries no arguments to name.
   */
  $effect(() => {
    for (const record of records) {
      if (record.target.kind !== "destination") continue;
      const target = record.target;
      void described(target.destination);
      void resolve(
        target.destination,
        Object.keys(target.arguments).map((field) => ({
          capability: target.capability,
          field,
          value: String(target.arguments[field] ?? ""),
        })),
      );
    }
  });

  type Line = Went & {
    readonly href?: string;
    readonly taken?: RoutingRecord;
  };

  /** One line per record, which is what a summary is: the whole of it is read elsewhere. */
  const lines = $derived.by((): readonly Line[] => {
    if (records.length > 0) {
      return records.map((record) => {
        const target = record.target;
        const reading =
          target.kind === "destination"
            ? readingHeld(target.destination, target.capability)
            : undefined;

        return {
          ...wentTo(
            record,
            nameOf,
            (field, value) =>
              target.kind === "destination"
                ? nameFor({
                    destination: target.destination,
                    capability: target.capability,
                    field,
                    value,
                  })
                : undefined,
            reading,
          ),
          href: recordHref(record.item, record.id),
          // Only a decision the person made by hand is theirs to take back:
          // a delivery is the pool's, and cancelling one it has carried out
          // would be undoing something that has already happened elsewhere.
          ...(target.kind === "user" ? { taken: record } : {}),
        };
      });
    }

    return summary === undefined
      ? []
      : wentWhere(summary, nameOf).map((name) => ({ name }));
  });

  const summarized = $derived(records.length === 0 && summary !== undefined);

  /** A summary counts what has not landed without saying which, so its mark ends the line. */
  const waiting = $derived(
    summarized && summary !== undefined ? summary.pending : 0,
  );

  async function undo(record: RoutingRecord) {
    said = "";
    try {
      await client.routing.cancel(record.id, record.item);
      // The row says it is undone; the log saying so again later is not news.
      notices.settled(keyFor(record.id));
      notices.mark(cancelledKey(record.id));
      onundone?.();
    } catch (error) {
      said = saidBy(error);
    }
  }
</script>

{#snippet went(line: Line)}<span class="font-semibold">{line.name}</span
  >{#if line.place !== undefined}<span class="ml-[1ch]" title={line.title}
      >{line.place}</span
    >{/if}{#if line.note !== undefined}<span class="ml-[1ch]">{line.note}</span
    >{/if}{#if line.pending === true}<span class="ml-[1ch]"
      ><Turning said="pending" /></span
    >{/if}{/snippet}

{#snippet waits()}
  {#if waiting > 0}
    <Turning said={`${String(waiting)} pending`} />
  {/if}
{/snippet}

{#snippet joined()}
  <span aria-hidden="true">→</span>
  {#each lines as line, at (at)}{@render went(line)}{at < lines.length - 1
      ? ", "
      : ""}{/each}
  {@render waits()}
{/snippet}

{#if short}
  {#if lines.length > 0}
    <div
      class="truncate"
      title={lines.map((line) => line.title ?? line.name).join(", ")}
    >
      {@render joined()}
    </div>
  {/if}
{:else if summarized}
  <!-- A summary names where without what, so it is one line, as a short one is. -->
  <div class="mt-2 break-words">{@render joined()}</div>
{:else if lines.length > 0 || said !== ""}
  <div class="mt-2">
    {#each lines as line (line.href)}
      <div class="flex flex-wrap items-baseline gap-x-4">
        <span class="min-w-0 break-words">
          <span aria-hidden="true">→</span>
          <a href={line.href}>{@render went(line)}</a>
        </span>

        {#if line.taken !== undefined}
          {@const record = line.taken}
          <button
            type="button"
            onclick={() => void undo(record)}
            class="shrink-0 hover:underline">undo</button
          >
        {/if}
      </div>
    {/each}

    {#if said !== ""}
      <div role="status" class="mt-1 text-alarm">{said}</div>
    {/if}
  </div>
{/if}
