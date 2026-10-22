<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import {
    Refused,
    saidBy,
    saidOf,
    type Item,
    type RoutingRecord,
  } from "@notemap/client";

  import AttachedLines from "$components/item/AttachedLines.svelte";
  import AttachedPictures from "$components/item/AttachedPictures.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { argumentsOf, type Argument } from "$lib/arguments";
  import { didWhat } from "$lib/capability";
  import { client } from "$lib/client";
  import { aboutItem } from "$lib/excerpt";
  import { followable } from "$lib/link";
  import { following } from "$lib/motion";
  import { nameFor } from "$lib/names.svelte";
  import { resolve } from "$lib/naming";
  import { notices } from "$lib/notices.svelte";
  import { pickable } from "$lib/pick";
  import { keepOutput, outputOf } from "$lib/outputs";
  import { described, readingHeld } from "$lib/described.svelte";
  import { sizeOf } from "$lib/attachments";
  import { cancelledKey, keyFor, placeIn } from "$lib/routing";
  import {
    BY_HAND,
    NOT_YET_DELIVERED,
    NOTHING_KEPT,
    OUTPUT_UNREADABLE,
  } from "$lib/said";

  /**
   * One routing record read as the file it became: the destination and the
   * place inside it as a path, what was done and by which template, then what
   * was written, exactly as it was sent. Not rendered: a path in the output
   * is the destination's and resolves nowhere here, and the item's own
   * attachments are drawn above it as the preview of what went with it.
   * Folded, it is the head alone, on one line. Drawn folded on the item and
   * as a routing kind's row in the log, and open on the record's own page.
   */
  let {
    record,
    held,
    said,
    alarm = false,
    blind = false,
    folds = true,
    lead,
    end,
    onundone,
  }: {
    record: RoutingRecord;
    /** The item, where the surface has it: its attachments are drawn above the words. */
    held?: Item;
    /** A body said in place of the output — a failure's detail, a cancellation. */
    said?: string;
    alarm?: boolean;
    /**
     * The surface does not know whether a copy was kept — the log's detail does
     * not say — so the output is asked for regardless, and a refusal saying
     * there is none is read as none rather than as a failure.
     */
    blind?: boolean;
    /** Drawn folded and opened by a press; where it does not fold it is always open. */
    folds?: boolean;
    /**
     * Drawn ahead of the folded line, which then stays as the open block's
     * heading rather than giving way to it.
     */
    lead?: Snippet;
    /** What the folded line says at its right, in place of what was done. */
    end?: Snippet;
    /** A record cancelled here leaves what was read of them out of date. */
    onundone?: () => void;
  } = $props();

  let opened = $state(false);
  const open = $derived(!folds || opened);

  const destinations = client.destinations.all;
  const templates = client.templates.all;

  const target = $derived(record.target);
  const byHand = $derived(target.kind === "user");

  const destination = $derived(
    target.kind === "destination"
      ? ($destinations.find((one) => one.id === target.destination)?.name ??
          "a destination")
      : BY_HAND,
  );

  const did = $derived(
    target.kind === "destination"
      ? didWhat(target.capability)
      : "marked processed",
  );

  /** The template's name as it stands; one since deleted is unnamed rather than an id. */
  const via = $derived(
    record.applied === undefined
      ? undefined
      : ($templates.find((one) => one.id === record.applied?.template)?.name ??
          "a template"),
  );

  const called = $derived((field: string, value: string) =>
    target.kind === "destination"
      ? nameFor({
          destination: target.destination,
          capability: target.capability,
          field,
          value,
        })
      : undefined,
  );

  const place = $derived(
    placeIn(
      record,
      called,
      target.kind === "destination"
        ? readingHeld(target.destination, target.capability)
        : undefined,
    ),
  );

  const link = $derived(followable(record.url));

  $effect(() => {
    if (target.kind !== "destination") return;
    const where = target;
    void described(where.destination);
    void resolve(
      where.destination,
      Object.keys(where.arguments).map((field) => ({
        capability: where.capability,
        field,
        value: String(where.arguments[field] ?? ""),
      })),
    );
  });

  const attachments = $derived(
    held === undefined ? [] : client.attachments(held),
  );

  let output = $state<string | undefined>(
    untrack(() => outputOf(record.id) ?? undefined),
  );
  let reading = $state(false);
  let unreadable = $state("");

  // One component may be reused across a change of record, and what was read
  // for one would otherwise be drawn as what the next one sent.
  $effect(() => {
    const known = outputOf(record.id);
    output = known ?? undefined;
    unreadable = "";
    none = known === null || (blind && byHand);
    named = undefined;
  });

  /**
   * Read on opening: whoever opens a record came to see what was sent. A read
   * that failed is not tried again on its own — `read it` is offered.
   */
  let none = $state(
    untrack(() => outputOf(record.id) === null || (blind && byHand)),
  );

  $effect(() => {
    if (!open || !kept) return;
    if (output !== undefined || unreadable !== "" || none || reading) return;
    void read();
  });

  async function read() {
    const asked = record.id;
    reading = true;
    unreadable = "";
    try {
      const bytes = await client.routing.output(asked);
      keepOutput(asked, bytes);
      if (asked === record.id) output = bytes;
    } catch (error) {
      if (asked !== record.id) return;
      if (blind && error instanceof Refused && error.code === "no-output") {
        keepOutput(asked, null);
        none = true;
      } else {
        unreadable = `${OUTPUT_UNREADABLE} ${saidBy(error)}`;
      }
    } finally {
      reading = false;
    }
  }

  /**
   * What went: the output as it landed, or — where the delivery kept no copy
   * but carried words of its own in place of the capture's — those words.
   */
  const body = $derived(
    output ??
      (target.kind === "destination" && target.content !== undefined
        ? saidOf(target.content)
        : undefined),
  );
  const kept = $derived(
    !none && (blind || record.output?.content !== undefined),
  );
  /** Whether anything is written where the output goes: the output, why there is none, or the line it will take. */
  const written = $derived(
    body !== undefined ||
      (!kept && !byHand) ||
      (kept && !blind && unreadable === ""),
  );
  const delivered = $derived(record.state === "delivered");
  const cancellable = $derived(!delivered && said === undefined);

  /**
   * How much the delivery wrote, measured off the copy this read rather than
   * taken from the record, which keeps no size. Only for an output that was
   * really read: words a delivery carried in place of the capture's were never
   * written anywhere this can speak for.
   */
  const wrote = $derived(
    output === undefined
      ? undefined
      : new TextEncoder().encode(output).byteLength,
  );

  /** The arguments named against the capability's schema, asked for on the press and kept. */
  let named = $state<readonly Argument[] | undefined>(undefined);
  let naming = $state(false);

  const hasArguments = $derived(
    target.kind === "destination" && Object.keys(target.arguments).length > 0,
  );

  async function showArguments() {
    if (named !== undefined) {
      named = undefined;
      return;
    }
    if (target.kind !== "destination") return;
    const where = target;
    naming = true;
    const schema = (await described(where.destination))?.find(
      (one) => one.name === where.capability,
    )?.argumentsSchema;
    named = argumentsOf(where.arguments, schema, called);
    naming = false;
  }

  const footed = $derived(
    hasArguments ||
      link !== undefined ||
      cancellable ||
      (byHand && said === undefined),
  );

  let failed = $state("");

  /** Both are the one call: a reservation not yet landed, or a decision made by hand. */
  async function takeBack(what: string) {
    failed = "";
    try {
      await client.routing.cancel(record.id, record.item);
      notices.settled(keyFor(record.id));
      notices.raise({
        what,
        key: cancelledKey(record.id),
        ...(held === undefined ? {} : { about: aboutItem(held) }),
      });
      onundone?.();
    } catch (error) {
      failed = saidBy(error);
    }
  }
</script>

{#snippet name(inLine: boolean)}
  {#if folds}
    <button
      type="button"
      aria-expanded={open}
      onclick={() => (opened = !opened)}
      class="text-left font-semibold hover:underline {inLine ? 'shrink-0' : ''}"
      >{destination}</button
    >
  {:else}
    <span class="font-semibold">{destination}</span>
  {/if}
{/snippet}

<!-- The box moves, the content inside it is what is measured: a line opening
     into a block grows into it rather than jumping. -->
<div {@attach following}>
  <div class="flow-root">
    {#if folds && (!open || lead !== undefined)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        data-folded
        class="flex cursor-pointer items-baseline gap-x-[1ch] {lead ===
        undefined
          ? 'max-w-read'
          : 'max-narrow:flex-wrap'}"
        onclick={pickable(() => (opened = !opened))}
      >
        {#if lead !== undefined}
          <!-- The excerpt gives way first: where it went is what the line is
               for. Below narrow it has a line of its own. -->
          <span class="min-w-[6ch] shrink-[1000] truncate max-narrow:basis-full"
            >{@render lead()}</span
          >
        {/if}
        <div
          class="flex min-w-0 items-baseline gap-x-[0.6ch] whitespace-nowrap"
        >
          {#if lead !== undefined}
            <span aria-hidden="true" class="shrink-0">→</span>
          {/if}
          {@render name(true)}
          {#if place !== undefined}
            <span aria-hidden="true" class="shrink-0">/</span>
            <span class="min-w-0 truncate">{place}</span>
          {/if}
        </div>
        <div class="ml-auto flex shrink-0 items-baseline gap-x-[2ch] pl-[1ch]">
          {#if end !== undefined}
            {@render end()}
          {:else}
            <span>{did}</span>
          {/if}
          {#if cancellable}
            <Action alarm onclick={() => void takeBack("cancelled")}
              >cancel</Action
            >
          {/if}
        </div>
      </div>

      {#if failed !== "" && !open}
        <div role="status" class="mt-1 text-alarm">{failed}</div>
      {/if}
    {/if}

    {#if open}
      <div
        class="max-w-read divide-y divide-ink border border-ink {lead !==
          undefined && folds
          ? 'mt-2.5'
          : ''}"
      >
        <div
          class="flex flex-wrap justify-between gap-x-[2ch] gap-y-1 px-3 py-1.5"
        >
          <div class="flex min-w-0 flex-wrap gap-x-[0.6ch]">
            {@render name(false)}
            {#if place !== undefined}
              <span aria-hidden="true">/</span>
              {#if link === undefined}
                <span class="min-w-0 break-words">{place}</span>
              {:else}
                <a href={link} rel="noreferrer" class="min-w-0 break-words"
                  >{place}</a
                >
              {/if}
            {/if}
          </div>
          <div class="flex flex-wrap gap-x-[2ch]">
            <span>{did}</span>
            {#if via !== undefined}
              <span>via {via}</span>
            {/if}
          </div>
        </div>

        {#if said !== undefined}
          <div class="px-3 py-2.5 break-words {alarm ? 'text-alarm' : ''}">
            {said}
          </div>
        {:else if !delivered}
          <div class="px-3 py-2.5">{NOT_YET_DELIVERED}</div>
        {:else}
          {#if attachments.length > 0 || written}
            <div class="px-3 py-2.5">
              <AttachedPictures {attachments} picture="max-h-48" />
              {#if body !== undefined}
                <pre class="break-words whitespace-pre-wrap">{body}</pre>
                {#if wrote !== undefined}
                  <div data-wrote class="mt-1">{sizeOf(wrote)} written</div>
                {/if}
              {:else if !kept && !byHand}
                <div>{NOTHING_KEPT}</div>
              {:else if kept && !blind && unreadable === ""}
                <!-- The line the output will take, held while it is read. -->
                <Asking />
              {/if}
              <AttachedLines {attachments} ruled={written} />
            </div>
          {/if}

          {#if unreadable !== ""}
            <div class="px-3 py-2.5">
              <div role="status">{unreadable}</div>
              <div class="mt-2">
                <Action working={reading} onclick={() => void read()}
                  >read it</Action
                >
              </div>
            </div>
          {/if}
        {/if}

        {#if target.kind === "user" && target.note !== undefined}
          <div class="px-3 py-2.5 break-words">{target.note}</div>
        {/if}
        {#if record.output?.note !== undefined}
          <div class="px-3 py-2.5 break-words">{record.output.note}</div>
        {/if}

        {#if named !== undefined}
          <div
            class="grid grid-cols-[max-content_1fr] gap-x-[3ch] px-3 py-1.5 max-narrow:grid-cols-1"
          >
            {#each named as argument (argument.name)}
              <span class="tracking-caps uppercase">{argument.name}</span>
              <span class="min-w-0 break-words">{argument.said}</span>
            {/each}
          </div>
        {/if}

        {#if footed}
          <div
            class="flex flex-wrap items-baseline justify-between gap-x-5 px-3 py-1"
          >
            <div class="flex flex-wrap gap-x-5 max-narrow:gap-x-3.5">
              {#if hasArguments}
                <Action disabled={naming} onclick={() => void showArguments()}>
                  arguments
                </Action>
              {/if}
            </div>
            <div class="flex flex-wrap gap-x-5 max-narrow:gap-x-3.5">
              {#if link !== undefined}
                <a href={link} rel="noreferrer" class="hover:underline"
                  >open ↗</a
                >
              {/if}
              {#if cancellable}
                <Action alarm onclick={() => void takeBack("cancelled")}
                  >cancel</Action
                >
              {:else if byHand && said === undefined}
                <Action onclick={() => void takeBack("undone")}>undo</Action>
              {/if}
            </div>
          </div>
        {/if}

        {#if failed !== ""}
          <div role="status" class="px-3 py-1.5 text-alarm">
            {failed}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
