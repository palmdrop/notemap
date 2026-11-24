<script lang="ts">
  import Icon from "$components/primitives/icon/Icon.svelte";
  import {
    saidBy,
    type RoutingRecord,
    type RoutingSummary,
  } from "@notemap/client";

  import { recordHref } from "$components/item/href";
  import Turning from "$components/primitives/marks/Turning.svelte";
  import { client } from "$lib/client";
  import { described, readingHeld } from "$lib/described.svelte";
  import { cancelRouting } from "$lib/firing";
  import { firings, left } from "$lib/firings.svelte";
  import Skeleton from "$components/primitives/marks/Skeleton.svelte";
  import Spinner from "$components/primitives/marks/Spinner.svelte";
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
    boxed = false,
    inert = false,
    offline = false,
    awaiting = false,
    onundone,
  }: {
    summary: RoutingSummary | undefined;
    records?: readonly RoutingRecord[];
    /** Every record on one line, cut where it runs out of room, and nothing to press. */
    short?: boolean;
    /** The item's own: a box of rows, each the way into its record. */
    boxed?: boolean;
    /** What happened rather than what stands: each line a way in, with nothing to take back. */
    inert?: boolean;
    /** Cancelling needs the pool, so out of reach nothing offers it. */
    offline?: boolean;
    /**
     * The records are being read: the summary is drawn in their lines' shape,
     * the place each will name held by a skeleton, so their landing moves
     * nothing.
     */
    awaiting?: boolean;
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
    readonly record?: string;
    readonly manual?: boolean;
    /** Withdrawn, where it was. */
    readonly state?: string;
    /** Where in the destination is still being read, and a skeleton holds its room. */
    readonly sketched?: boolean;
    readonly taken?: RoutingRecord;
    /** A delivery not landed yet, and what it offers now, as its route in flight does. */
    readonly offers?: {
      readonly record: RoutingRecord;
      readonly label: "undo" | "cancel";
    };
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
          record: record.id,
          ...(reading === "asking" ? { sketched: true } : {}),
          ...(target.kind === "user" ? { manual: true } : {}),
          ...(record.withdrawnAt === undefined ? {} : { state: "withdrawn" }),
          // A delivery the pool has carried out has happened elsewhere and is
          // withdrawn, never taken back.
          ...(target.kind === "user" ? { taken: record } : offered(record)),
        };
      });
    }

    return summary === undefined
      ? []
      : wentWhere(summary, nameOf).map((name) => ({ name }));
  });

  function offered(record: RoutingRecord): Pick<Line, "offers"> {
    if (record.state !== "pending") return {};
    const label = firings.offer(record.id);
    return label === undefined ? {} : { offers: { record, label } };
  }

  const summarized = $derived(records.length === 0 && summary !== undefined);

  /** The summary's lines in a record's shape: where each went, without where in it. */
  const sketched = $derived<readonly Line[]>(
    summary === undefined
      ? []
      : summary.to.map((went) =>
          went.kind === "destination"
            ? { name: nameOf(went.destination), sketched: awaiting }
            : { name: "manual", manual: true },
        ),
  );

  /** A summary counts what has not landed without saying which, so its mark ends the line. */
  const waiting = $derived(
    summarized && summary !== undefined ? summary.pending : 0,
  );

  /**
   * A record's line: on a phone the place under the destination, always; when
   * wide beside it, cut. Either way the same height whatever the place says,
   * and whether it is said yet.
   */
  const LINE =
    "flex min-w-0 flex-col items-start gap-x-[1ch] text-small wide:flex-row wide:items-baseline";

  async function cancel(record: RoutingRecord, name: string) {
    await cancelRouting(record.id, record.item, name);
    onundone?.();
  }

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

<!-- Two lines at the most, however narrow the rail: where the place does not
     fit beside the destination it goes under it, whole or cut, and the mark
     saying it has not landed stays at its end. -->
{#snippet single(line: Line)}
  <span class="flex max-w-full min-w-0 items-baseline gap-x-[0.5ch]">
    <Icon
      name={line.manual === true ? "check" : "route"}
      class="size-3.5 shrink-0 self-center"
    />
    <span class="min-w-0 truncate text-ink"
      >{line.manual === true ? "Manual" : line.name}</span
    >
  </span>
  {#if line.place !== undefined || line.note !== undefined || line.pending === true || line.sketched === true}
    <span class="flex max-w-full min-w-0 items-baseline gap-x-[1ch] text-muted">
      {#if line.place !== undefined}
        <span class="min-w-0 truncate" title={line.title}>{line.place}</span>
      {:else if line.sketched === true}
        <Skeleton shape="place" />
      {/if}
      {#if line.note !== undefined}
        <span class="min-w-0 truncate">{line.note}</span>
      {/if}
      {#if line.pending === true}
        <span class="shrink-0"><Turning said="pending" /></span>
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet waits()}
  {#if waiting > 0}
    <Turning said={`${String(waiting)} pending`} />
  {/if}
{/snippet}

{#snippet joined()}
  <Icon name="route" class="inline size-3.5 align-[-0.125em]" />
  {#each lines as line, at (at)}{@render went(line)}{at < lines.length - 1
      ? ", "
      : ""}{/each}
  {@render waits()}
{/snippet}

{#if boxed}
  <!-- Rows only from the records themselves: a summary has nothing to open. -->
  {#if records.length > 0}
    <ul
      aria-label="Routing records"
      class="divide-y divide-tag-line overflow-hidden rounded-control border border-tag-line bg-tag"
    >
      {#each lines as line (line.href ?? line.name)}
        {@const flying = firings.open.find((one) => one.record === line.record)}
        {@const seconds =
          flying === undefined ? undefined : left(flying, firings.now)}
        <!-- A route still in its window says so on its own line: the
             spinner, the seconds left and Cancel, then the plain line once
             it has landed. -->
        <li class="flex items-center">
          <a
            href={line.href}
            class="flex min-h-target min-w-0 flex-1 items-center gap-3 py-2 pl-gutter text-ink no-underline hover:bg-band hover:no-underline {flying ===
              undefined || line.offers === undefined
              ? 'pr-gutter'
              : 'pr-2'}"
            title={[line.name, line.title ?? line.place, line.note]
              .filter((part) => part !== undefined)
              .join(" ")}
          >
            {#if flying !== undefined}
              <span class="grid size-5 flex-none place-items-center"
                ><Spinner /></span
              >
            {:else}
              <Icon
                name={line.manual === true ? "check" : "route"}
                class="size-5 flex-none"
              />
            {/if}
            <span class="flex min-w-0 flex-1 items-baseline gap-x-[1ch]">
              <span class="flex-none"
                >{line.manual === true ? "Manual" : line.name}</span
              >
              {#if line.place !== undefined || line.note !== undefined}
                <span class="min-w-0 truncate text-muted"
                  >{line.place ?? line.note}</span
                >
              {/if}
            </span>
            {#if flying !== undefined}
              <span class="flex-none text-small text-muted tabular-nums"
                >{seconds === undefined
                  ? `Sending to ${flying.to ?? line.name}`
                  : `${String(seconds)}s`}</span
              >
            {:else if line.pending === true}
              <Turning said="pending" />
            {:else if line.state !== undefined}
              <span class="flex-none text-small text-muted">{line.state}</span>
            {/if}
            {#if flying === undefined || line.offers === undefined}
              <Icon name="chevron" class="size-5 flex-none text-muted" />
            {/if}
          </a>
          {#if flying !== undefined && line.offers !== undefined && !offline}
            {@const { record } = line.offers}
            <button
              type="button"
              aria-label={`Cancel routing ${flying.name}`}
              onclick={() => void cancel(record, flying.name)}
              class="flex-none px-gutter py-2 underline underline-offset-[0.2em]"
              >Cancel</button
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{:else if short}
  {#if lines.length > 0}
    <div
      class="truncate"
      title={lines.map((line) => line.title ?? line.name).join(", ")}
    >
      {@render joined()}
    </div>
  {/if}
{:else if summarized}
  <!-- A summary names where without what: a record's line without its
       place, which a skeleton holds while the records are read. -->
  <div class="mt-2">
    {#each sketched as line, at (at)}
      <div class="flex items-baseline gap-x-4">
        <span class={LINE}>{@render single(line)}</span>
        {#if at === sketched.length - 1 && waiting > 0}
          <span class="shrink-0 text-small">{@render waits()}</span>
        {/if}
      </div>
    {/each}
  </div>
{:else if lines.length > 0 || said !== ""}
  <div class="mt-2">
    {#each lines as line (line.href)}
      <div class="flex items-baseline gap-x-4">
        <a
          href={line.href}
          class="{LINE} no-underline hover:underline"
          title={[line.name, line.title ?? line.place, line.note]
            .filter((part) => part !== undefined)
            .join(" ")}>{@render single(line)}</a
        >

        {#if inert}
          <!-- An entry in the log: what it did, not what can be done now. -->
        {:else if line.taken !== undefined}
          {@const record = line.taken}
          <button
            type="button"
            onclick={() => void undo(record)}
            class="shrink-0 text-small underline underline-offset-[0.2em]"
            >Undo</button
          >
        {:else if line.offers !== undefined}
          {@const { record, label } = line.offers}
          <button
            type="button"
            onclick={() => void cancel(record, line.name)}
            class="shrink-0 text-small underline underline-offset-[0.2em]"
            >{label === "undo" ? "Undo" : "Cancel"}</button
          >
        {/if}
      </div>
    {/each}

    {#if said !== ""}
      <div role="status" class="mt-1 text-danger">{said}</div>
    {/if}
  </div>
{/if}
