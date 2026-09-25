<script lang="ts">
  import type { Action, RoutingRecord } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import Block from "$components/record/Block.svelte";
  import { factOf, failed, flattened, known } from "$lib/actions";
  import { client } from "$lib/client";
  import { kindWord } from "$lib/kinds";
  import { slide } from "$lib/motion";
  import { CALLED_OFF, UNDONE } from "$lib/said";

  import Detail from "./Detail.svelte";
  import Says from "./Says.svelte";

  /**
   * One row of the log on the register: when and what kind in the rail; what
   * it was about and the one fact the kind carries in the body; and under a
   * routing kind, the record itself as the block the item draws.
   */
  let {
    action,
    gap = false,
    motion,
  }: {
    action: Action;
    gap?: boolean;
    /** Whether the log's latest change is one a read brought; absent, nothing moves. */
    motion?: { readonly still: boolean };
  } = $props();

  const destinations = client.destinations.all;
  const templates = client.templates.all;

  const naming = $derived({
    template: (id: string) =>
      $templates.find((one) => one.id === id)?.name ?? "a template",
    destination: (id: string) =>
      $destinations.find((one) => one.id === id)?.name ?? "a destination",
  });

  const bad = $derived(failed(action.kind));
  const fact = $derived(factOf(action.kind, action.detail, naming));
  const pairs = $derived(known(action.kind) ? [] : flattened(action.detail));

  const NAMESPACE = "route/";

  /** A trigger tag reads as the trigger it is, as it does on a row. */
  const trigger = $derived(
    fact?.trigger === true && fact.said.startsWith(NAMESPACE)
      ? fact.said.slice(NAMESPACE.length)
      : undefined,
  );

  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value !== "" ? value : undefined;

  /**
   * The record a routing kind is about, as far as the action's detail says:
   * enough for the block's head, the output read by the record's id. The
   * arguments, the URL and the notes are the record's own and are not here.
   */
  const record = $derived.by((): RoutingRecord | undefined => {
    const kind = action.kind;
    if (
      kind !== "routed" &&
      kind !== "delivery-failed" &&
      kind !== "delivery-cancelled"
    ) {
      return undefined;
    }
    const detail = action.detail;
    const id = text(detail["record"]);
    const item = action.subject;
    if (id === undefined || item === undefined) return undefined;

    const destination = text(detail["destination"]);
    const capability = text(detail["capability"]);
    const template = text(detail["template"]);
    const pointer = text(detail["pointer"]);

    return {
      id,
      item,
      at: action.at,
      state: kind === "delivery-failed" ? "pending" : "delivered",
      target:
        destination === undefined || capability === undefined
          ? { kind: "user" }
          : { kind: "destination", destination, capability, arguments: {} },
      ...(template === undefined
        ? {}
        : {
            applied: {
              template,
              firedByTag: detail["firedByTag"] === true,
            },
          }),
      ...(pointer === undefined ? {} : { pointer }),
    };
  });

  const failure = $derived.by(() => {
    const held = action.detail["failure"];
    return typeof held === "object" && held !== null
      ? text((held as Record<string, unknown>)["detail"])
      : undefined;
  });

  const said = $derived(
    action.kind === "delivery-failed"
      ? (failure ?? "delivery failed")
      : action.kind === "delivery-cancelled"
        ? action.detail["target"] === "user"
          ? UNDONE
          : CALLED_OFF
        : undefined,
  );
</script>

<div
  class="col-span-full grid grid-cols-subgrid"
  transition:slide={{ fade: true, still: motion?.still ?? true }}
>
  <Rail {gap}>
    <Stamp at={action.at} />
    <div class="mt-2 tracking-caps uppercase {bad ? 'text-alarm' : ''}">
      {kindWord(action.kind)}
    </div>
  </Rail>

  <Body {gap}>
    <div
      class="flex items-baseline justify-between gap-x-[3ch] max-narrow:flex-col"
    >
      {#if action.subject !== undefined}
        <span class="min-w-0 truncate">
          <Says id={action.subject} href={itemHref(action.subject)} />
        </span>
      {:else}
        <span></span>
      {/if}

      {#if fact !== undefined}
        <span
          class="max-w-[22rem] shrink-0 truncate max-narrow:max-w-full {fact.alarm ===
          true
            ? 'text-alarm'
            : ''} {trigger === undefined
            ? ''
            : 'font-semibold tracking-[0.04em] [font-variant-caps:all-small-caps]'}"
        >
          {trigger ?? fact.said}
        </span>
      {/if}
    </div>

    {#if pairs.length > 0}
      <Detail {pairs} failed={bad} />
    {/if}

    {#if record !== undefined}
      <div class="mt-2.5">
        <Block
          {record}
          {said}
          alarm={bad}
          inLog
          blind={action.kind === "routed"}
        />
      </div>
    {/if}
  </Body>
</div>
