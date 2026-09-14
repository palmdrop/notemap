<script lang="ts">
  import {
    saidBy,
    saidOf,
    type Item,
    type RoutingRecord,
  } from "@notemap/client";
  import { readFrontmatter } from "@notemap/output-markdown/frontmatter";

  import { itemHref } from "$components/item/href";
  import Action from "$components/primitives/controls/Action.svelte";
  import Prose from "$components/primitives/text/Prose.svelte";
  import { argumentsOf, type Argument } from "$lib/arguments";
  import { didWhat } from "$lib/capability";
  import { client } from "$lib/client";
  import { aboutItem } from "$lib/excerpt";
  import { followable } from "$lib/link";
  import { nameFor } from "$lib/names.svelte";
  import { resolve } from "$lib/naming";
  import { notices } from "$lib/notices.svelte";
  import { placeNamed } from "$lib/routing";
  import {
    BY_HAND,
    NOT_YET_DELIVERED,
    NOTHING_KEPT,
    OUTPUT_UNREADABLE,
  } from "$lib/said";

  /**
   * One routing record read as the file it became: the destination and the
   * place inside it as a path, what was done and by which template, then what
   * was written, rendered as the destination would show it. Drawn on the item,
   * on the record's own page and under a routing kind in the log.
   */
  let {
    record,
    held,
    said,
    alarm = false,
    inLog = false,
    onundone,
  }: {
    record: RoutingRecord;
    /** The item, where the surface has it: its attachments are drawn above the words. */
    held?: Item;
    /** A body said in place of the output — a failure's detail, a cancellation. */
    said?: string;
    alarm?: boolean;
    /** The log draws the way to the item in the foot; the item's own surfaces need none. */
    inLog?: boolean;
    /** A record cancelled here leaves what was read of them out of date. */
    onundone?: () => void;
  } = $props();

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
    record.pointer ??
      (target.kind === "destination"
        ? placeNamed(target.arguments, called)
        : undefined),
  );

  const link = $derived(followable(record.url));

  $effect(() => {
    if (target.kind !== "destination") return;
    const where = target;
    void resolve(
      where.destination,
      Object.keys(where.arguments).map((field) => ({
        capability: where.capability,
        field,
        value: String(where.arguments[field] ?? ""),
      })),
    );
  });

  const images = $derived(held === undefined ? [] : client.images(held));

  let output = $state<string | undefined>(undefined);
  let reading = $state(false);
  let unreadable = $state("");

  // One component may be reused across a change of record, and what was read
  // for one would otherwise be drawn as what the next one sent.
  $effect(() => {
    void record.id;
    output = undefined;
    unreadable = "";
    raw = false;
    named = undefined;
  });

  /**
   * Read on arrival: whoever is looking at a record came to see what was sent.
   * A read that failed is not tried again on its own — `read it` is offered.
   */
  $effect(() => {
    if (record.output?.content === undefined) return;
    if (output !== undefined || unreadable !== "" || reading) return;
    void read();
  });

  async function read() {
    const asked = record.id;
    reading = true;
    unreadable = "";
    try {
      const bytes = await client.routing.output(asked);
      if (asked === record.id) output = bytes;
    } catch (error) {
      if (asked === record.id)
        unreadable = `${OUTPUT_UNREADABLE} ${saidBy(error)}`;
    } finally {
      reading = false;
    }
  }

  const front = $derived(
    output === undefined ? undefined : readFrontmatter(output),
  );

  /**
   * What went: the output as it landed, or — where the delivery kept no copy
   * but carried words of its own in place of the capture's — those words.
   */
  const body = $derived(
    front?.body ??
      output ??
      (target.kind === "destination" && target.content !== undefined
        ? saidOf(target.content)
        : undefined),
  );
  const properties = $derived(
    front === undefined
      ? []
      : [...front.entries].map(([key, value]) => ({
          key,
          value: Array.isArray(value) ? value.join(", ") : String(value),
        })),
  );

  const kept = $derived(record.output?.content !== undefined);
  const delivered = $derived(record.state === "delivered");

  let raw = $state(false);

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
    const described = await client.destinations
      .describe(where.destination)
      .catch(() => undefined);
    const schema =
      described?.kind === "described"
        ? described.capabilities.find((one) => one.name === where.capability)
            ?.argumentsSchema
        : undefined;
    named = argumentsOf(where.arguments, schema, called);
    naming = false;
  }

  let failed = $state("");

  /** Both are the one call: a reservation not yet landed, or a decision made by hand. */
  async function takeBack(what: string) {
    failed = "";
    try {
      await client.routing.cancel(record.id, record.item);
      notices.raise({
        what,
        ...(held === undefined ? {} : { about: aboutItem(held) }),
      });
      onundone?.();
    } catch (error) {
      failed = saidBy(error);
    }
  }
</script>

<div class="max-w-read border border-ink">
  <div
    class="flex flex-wrap justify-between gap-x-[2ch] gap-y-1 border-b border-ink px-3 py-1.5"
  >
    <div class="flex min-w-0 flex-wrap gap-x-[0.6ch]">
      <span class="font-semibold">{destination}</span>
      {#if place !== undefined}
        <span aria-hidden="true">/</span>
        {#if link === undefined}
          <span class="min-w-0 break-words">{place}</span>
        {:else}
          <a href={link} rel="noreferrer" class="min-w-0 break-words">{place}</a
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
    {#if properties.length > 0}
      <div
        class="grid grid-cols-[max-content_1fr] gap-x-[3ch] border-b border-ink px-3 py-1.5 max-narrow:grid-cols-1"
      >
        {#each properties as property (property.key)}
          <span class="tracking-caps uppercase">{property.key}</span>
          <span class="min-w-0 break-words">{property.value}</span>
        {/each}
      </div>
    {/if}

    {#if images.length > 0 || body !== undefined || (!kept && !byHand)}
      <div class="px-3 py-2.5">
        {#each images as image (image)}
          <img
            src={image}
            alt=""
            loading="lazy"
            class="mb-2 block max-h-48 max-w-full object-contain object-left"
          />
        {/each}
        {#if body !== undefined}
          <Prose text={body} full />
        {:else if !kept && !byHand}
          <div>{NOTHING_KEPT}</div>
        {/if}
      </div>
    {/if}

    {#if unreadable !== ""}
      <div class="px-3 py-2.5">
        <div role="status">{unreadable}</div>
        <div class="mt-2">
          <Action disabled={reading} onclick={() => void read()}>
            {reading ? "reading…" : "read it"}
          </Action>
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

  {#if raw && output !== undefined}
    <pre
      class="border-t border-ink px-3 py-2.5 break-words whitespace-pre-wrap">{output}</pre>
  {/if}

  {#if named !== undefined}
    <div
      class="grid grid-cols-[max-content_1fr] gap-x-[3ch] border-t border-ink px-3 py-1.5 max-narrow:grid-cols-1"
    >
      {#each named as argument (argument.name)}
        <span class="tracking-caps uppercase">{argument.name}</span>
        <span class="min-w-0 break-words">{argument.said}</span>
      {/each}
    </div>
  {/if}

  <div
    class="flex flex-wrap items-baseline justify-between gap-x-5 border-t border-ink px-3 py-1"
  >
    <div class="flex flex-wrap gap-x-5 max-narrow:gap-x-3.5">
      {#if output !== undefined}
        <Action onclick={() => (raw = !raw)}>raw</Action>
      {/if}
      {#if hasArguments}
        <Action disabled={naming} onclick={() => void showArguments()}>
          arguments
        </Action>
      {/if}
      {#if inLog}
        <Action href={itemHref(record.item)}>item</Action>
      {/if}
    </div>
    <div class="flex flex-wrap gap-x-5 max-narrow:gap-x-3.5">
      {#if link !== undefined}
        <a href={link} rel="noreferrer" class="hover:underline">open ↗</a>
      {/if}
      {#if !delivered && said === undefined}
        <Action alarm onclick={() => void takeBack("cancelled")}>cancel</Action>
      {:else if byHand && said === undefined}
        <Action onclick={() => void takeBack("undone")}>undo</Action>
      {/if}
    </div>
  </div>

  {#if failed !== ""}
    <div role="status" class="border-t border-ink px-3 py-1.5 text-alarm">
      {failed}
    </div>
  {/if}
</div>
