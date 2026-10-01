<script lang="ts">
  import type { Snippet } from "svelte";

  import type { Destination, RoutingTemplate } from "@notemap/client";
  import type { RoutingTemplateReport } from "@notemap/client";

  import Fact from "$components/settings/Fact.svelte";
  import Lead from "$components/primitives/text/Lead.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { argumentsOf } from "$lib/arguments";
  import { capabilityHeld, described } from "$lib/described.svelte";
  import { slide } from "$lib/motion";
  import { pickable } from "$lib/pick";
  import { nameFor } from "$lib/names.svelte";
  import { resolve } from "$lib/naming";
  import { readingOf } from "$lib/routing";
  import { placeOf } from "$lib/templates";

  let {
    one,
    destination,
    report,
    asking,
    opened,
    editing,
    offline,
    onopen,
    oncheck,
    onedit,
    ondelete,
    children,
  }: {
    one: RoutingTemplate;
    /** Absent means it was deleted under the template, which is what strands one. */
    destination?: Destination;
    report?: RoutingTemplateReport;
    asking: boolean;
    opened: boolean;
    /**
     * The form is open below. What a template says and what it is being changed
     * to are the same fields twice, and the settled copy is the one to go: a
     * row reading `create` above an input reading `require` says the template
     * refused the edit.
     */
    editing: boolean;
    offline: boolean;
    onopen: () => void;
    oncheck: () => void;
    onedit: () => void;
    ondelete: () => void;
    children?: Snippet;
  } = $props();

  const stranded = $derived(destination === undefined);

  /**
   * What the row leads with. Only the two that a person has to act on take the
   * accent: *could not ask* is an ordinary condition — a vault asleep on a
   * train — and lighting up four rows for it would make the colour say nothing.
   */
  const said = $derived.by(() => {
    if (report === undefined) {
      return { text: "not asked yet", alarm: false, asking };
    }

    switch (report.kind) {
      case "fits":
        return { text: "ok", alarm: false };
      case "stranded":
        return { text: "destination deleted", alarm: true };
      case "destination-retired":
        return { text: "destination disabled", alarm: true };
      case "folder-missing":
        return { text: `${report.folder} missing`, alarm: true };
      case "capability-undeclared":
        return {
          text: `${report.capability} is no longer offered`,
          alarm: true,
        };
      case "arguments-invalid":
        return { text: "arguments refused", alarm: true };
      case "destination-unusable":
        return { text: report.detail, alarm: false };
      case "unreachable":
        return { text: "not reachable", alarm: false };
    }
  });

  /**
   * Asked once per row, and only for what is not remembered already: this page
   * draws pool state and a channel id says nothing a person can read. What
   * comes back is kept, so the second visit draws names before anything is
   * asked and a pool nobody can reach still says which channel.
   */
  $effect(() => {
    const asking = one;
    void described(asking.destination);
    void resolve(
      asking.destination,
      Object.keys(asking.arguments).map((field) => ({
        capability: asking.capability,
        field,
        value: String(asking.arguments[field] ?? ""),
      })),
    );
  });

  function pick() {
    if (editing) return;
    onopen();
  }

  const capability = $derived(capabilityHeld(one.destination, one.capability));
  const settings = $derived(readingOf(capability)?.settings ?? []);

  const called = $derived((field: string, value: string) =>
    nameFor({
      destination: one.destination,
      capability: one.capability,
      field,
      value,
    }),
  );

  const place = $derived(placeOf(one, called, settings));

  /** The settings this template takes for its deliveries, each its own fact. */
  const taken = $derived(
    argumentsOf(
      Object.fromEntries(
        Object.entries(one.arguments).filter(([name]) =>
          settings.includes(name),
        ),
      ),
      capability?.argumentsSchema,
    ),
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="py-4 {opened
    ? '-mx-3 -mt-px border border-ink px-3 max-narrow:-mx-2 max-narrow:px-2'
    : 'border-b border-b-ink'}"
  onclick={pickable(pick)}
>
  <div class="flex cursor-pointer flex-wrap items-baseline gap-x-3">
    <button
      type="button"
      onclick={pick}
      aria-expanded={opened}
      class="font-semibold hover:underline"
    >
      {one.name}
    </button>
    <span>{destination?.name ?? one.destination}</span>
    {#if one.triggerTag !== undefined}
      <span
        class="font-semibold tracking-[0.04em] [font-variant-caps:all-small-caps]"
      >
        {one.triggerTag.replace(/^route\//, "")}
      </span>
    {/if}
    <span class="break-all">{place}</span>

    <span
      class="ml-auto whitespace-nowrap {said.alarm
        ? 'text-alarm'
        : ''} max-narrow:ml-0 max-narrow:w-full"
    >
      {#if said.asking === true}
        <Asking subject={destination?.name} />
      {:else}
        {said.text}
      {/if}
    </span>
  </div>

  {#if stranded}
    <p class="mt-1 text-alarm">Does nothing until repointed.</p>
  {/if}

  {#if opened && !editing}
    <div class="mt-4" transition:slide={{ magnitude: "short" }}>
      <Fact name="tag">
        {one.triggerTag ?? "none — taken in the composer"}
      </Fact>
      <Fact name="destination">
        {#if destination === undefined}
          <Lead lead={one.destination} rest="deleted" />
        {:else}
          {destination.name}
        {/if}
      </Fact>
      <Fact name="action">{one.capability}</Fact>
      <Fact name="place">{place}</Fact>
      {#each taken as setting (setting.name)}
        <Fact name={setting.name}>{setting.said}</Fact>
      {/each}
      <Fact name="folder">
        <Lead
          lead={one.folder}
          rest={one.folder === "establish"
            ? one.establishedAt === undefined
              ? "not established yet"
              : `established ${one.establishedAt.slice(0, 10)}`
            : undefined}
        />
      </Fact>
      <Fact name="used">
        {#if one.fired.records === 0}
          nothing yet
        {:else}
          <Lead
            lead={`${String(one.fired.records)} times`}
            rest={one.fired.lastAt === undefined
              ? undefined
              : `last ${one.fired.lastAt.slice(0, 10)}`}
          />
        {/if}
      </Fact>

      {#if report?.kind === "folder-missing"}
        <p class="mt-2 text-alarm">
          Next delivery refused, and the item returns to the queue.
        </p>
      {/if}

      <div
        class="mt-3 flex flex-wrap items-baseline gap-x-6 border-t border-t-ink pt-3"
      >
        {#if !stranded}
          <Action disabled={asking} onclick={oncheck}>check again</Action>
        {/if}
        <Action disabled={offline} onclick={onedit}>edit</Action>
        <span class="ml-auto max-narrow:ml-0">
          <Action alarm disabled={offline} onclick={ondelete}>delete</Action>
        </span>
      </div>
    </div>
  {/if}

  {#if opened}
    {@render children?.()}
  {/if}
</div>
