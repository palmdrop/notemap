<script lang="ts">
  import type { Action, RoutingRecord } from "@notemap/client";

  import { itemHref } from "$components/item/href";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import Routing from "$components/item/Routing.svelte";
  import { factOf, failed, flattened, known, namingIn } from "$lib/actions";
  import { client } from "$lib/client";
  import { kindWord } from "$lib/kinds";
  import { described, readingHeld } from "$lib/described.svelte";
  import { recordsOf } from "$lib/records.svelte";
  import { following, slide } from "$lib/motion";
  import { CALLED_OFF, UNDONE } from "$lib/said";

  import Detail from "./Detail.svelte";
  import FactSaid from "./FactSaid.svelte";
  import Says from "./Says.svelte";

  /**
   * One row of the log, in the queue's register: the time in the rail; what
   * kind and the one fact it carries, what it was about, and for a routing
   * kind a line saying where it went, which opens the record.
   */
  let {
    action,
    heard = false,
  }: {
    action: Action;
    /**
     * Arrived from the watcher rather than with a read: it slides in, and grows
     * into what it goes on to hold. What a read brings, and all it goes on to
     * fill in, stands still.
     */
    heard?: boolean;
  } = $props();

  const destinations = client.destinations.all;
  const templates = client.templates.all;

  const naming = $derived(namingIn($templates, $destinations));

  const bad = $derived(failed(action.kind));
  /** A manual mark is routed to the person, and reads as what it is. */
  const kind = $derived(
    action.kind === "routed" && action.detail["target"] === "user"
      ? "done"
      : kindWord(action.kind),
  );
  const fact = $derived(factOf(action.kind, action.detail, naming));
  const pairs = $derived(known(action.kind) ? [] : flattened(action.detail));

  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value !== "" ? value : undefined;

  /**
   * The record a routing kind is about, as far as the action's detail says:
   * enough for the line, and for the block where the record itself is gone.
   */
  const told = $derived.by((): RoutingRecord | undefined => {
    const kind = action.kind;
    if (
      kind !== "routed" &&
      kind !== "delivery-failed" &&
      kind !== "delivery-cancelled" &&
      kind !== "delivery-withdrawn" &&
      kind !== "delivery-reinstated"
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
      // As the entry left it: the record read on opening says how it stands now.
      ...(kind === "delivery-withdrawn" ? { withdrawnAt: action.at } : {}),
    };
  });

  let asked = $state(false);

  // A place that is no path — a channel, a board — is named only by the
  // record's own arguments, which the entry does not carry: such a record is
  // read at once, so its line names the place rather than an id.
  $effect(() => {
    const target = told?.target;
    if (target?.kind !== "destination" || told?.state !== "delivered") return;
    void described(target.destination);
    const reading = readingHeld(target.destination, target.capability);
    if (reading !== undefined && reading !== "asking" && !reading.pathed) {
      asked = true;
    }
  });

  // Kept once asked: closing it would drop the record back to the detail.
  const records = recordsOf(
    () => (told === undefined ? undefined : action.subject),
    () => asked,
  );
  const held = $derived(records.all.find((one) => one.id === told?.id));
  const record = $derived(held ?? told);

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

{#snippet subject()}
  {#if action.subject !== undefined}
    <Says id={action.subject} href={itemHref(action.subject)} />
  {/if}
{/snippet}

<div
  data-heard={heard ? "" : undefined}
  class="col-span-full grid grid-cols-subgrid"
  transition:slide={{ fade: true, still: !heard }}
  {@attach heard && following}
>
  <div
    class="col-span-full grid grid-cols-subgrid self-start border-b border-rule"
  >
    <Rail>
      <Stamp at={action.at} dated={false} />
    </Rail>

    <Body>
      <div class="flex min-w-0 flex-col gap-1.5">
        <!-- What happened, in small capitals, and the one fact it carries at
             the right: the template, the tag, the channel. -->
        <div class="flex min-w-0 items-baseline justify-between gap-x-4">
          <span
            class="text-small tracking-caps uppercase {bad
              ? 'text-danger'
              : 'text-muted'}">{kind}</span
          >
          {#if fact !== undefined}
            <span class="min-w-0 truncate text-small text-muted"
              ><FactSaid {fact} /></span
            >
          {/if}
        </div>

        {#if action.subject !== undefined}
          <span class="min-w-0 truncate">{@render subject()}</span>
        {/if}

        <!-- A manual mark says all it has in its kind. -->
        {#if record !== undefined && record.target.kind !== "user"}
          <div class="-mt-2 text-small">
            <Routing summary={undefined} records={[record]} inert />
          </div>
        {/if}
        {#if said !== undefined}
          <p class="text-small {bad ? 'text-danger' : 'text-muted'}">{said}</p>
        {/if}

        {#if pairs.length > 0}
          <Detail {pairs} failed={bad} />
        {/if}
      </div>
    </Body>
  </div>
</div>
