<script lang="ts">
  import { goto } from "$app/navigation";

  import type { Destination, RoutingTemplate } from "@notemap/client";
  import type { RoutingTemplateReport } from "@notemap/client";

  import Band from "$components/primitives/blocks/Band.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import PageBar from "$components/primitives/frame/PageBar.svelte";
  import Trigger from "$components/primitives/marks/Trigger.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import StateBox from "$components/primitives/rows/StateBox.svelte";
  import { headed } from "$lib/heading.svelte";
  import { whereOf } from "$lib/looks";
  import { reportSaid } from "$lib/template-state";
  import { actionOf, labelFor, wordFor } from "$lib/vocabulary";

  import { editHref, openHref, settingsHref, trailTo } from "./href";
  import { carriesAssets } from "$lib/capability";
  import { argumentsOf } from "$lib/arguments";
  import { askedOf } from "$lib/asked";
  import {
    capabilityHeld,
    described,
    readingHeld,
  } from "$lib/described.svelte";
  import { nameFor } from "$lib/names.svelte";
  import { resolve } from "$lib/naming";
  import { placeOf } from "$lib/templates";

  let {
    one,
    destination,
    report,
    asking,
    offline,
    oncheck,
    ondelete,
  }: {
    one: RoutingTemplate;
    /** Absent means it was deleted under the template, which is what strands one. */
    destination?: Destination;
    report?: RoutingTemplateReport;
    asking: boolean;
    offline: boolean;
    oncheck: () => void;
    ondelete: () => void;
  } = $props();

  const stranded = $derived(destination === undefined);

  const said = $derived(reportSaid(report, asking));

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

  const capability = $derived(capabilityHeld(one.destination, one.capability));
  const reading = $derived(readingHeld(one.destination, one.capability));
  const settings = $derived(
    reading === "asking" ? [] : (reading?.settings ?? []),
  );

  const called = $derived((field: string, value: string) =>
    nameFor({
      destination: one.destination,
      capability: one.capability,
      field,
      value,
    }),
  );

  const place = $derived(
    reading === "asking" ? "" : placeOf(one, called, reading),
  );

  const asks = $derived(askedOf(one, capability?.argumentsSchema));

  /** The settings this template takes for its deliveries, each its own fact. */
  const taken = $derived(
    argumentsOf(
      Object.fromEntries(
        Object.entries(one.arguments).filter(
          ([name]) => settings.includes(name) && !(name in (one.asked ?? {})),
        ),
      ),
      capability?.argumentsSchema,
    ),
  );

  headed(() => ({
    title: one.name,
    trail: trailTo("templates"),
    out: {
      icon: "back",
      label: "Templates",
      run: () => void goto(settingsHref("templates")),
    },
    under: whereOf(one),
  }));
</script>

<div class="flex flex-col">
  <div class="pb-4">
    {#if stranded}
      <StateBox tone="danger" icon="route">
        <b>Stranded.</b> Its destination was deleted, so nothing is routed by this
        template. Point it at another destination, or delete it.
      </StateBox>
    {:else if said.alarm}
      <StateBox tone="danger" icon="close">{said.text}</StateBox>
    {:else if said.asking === true}
      <StateBox turning
        >Asking {destination?.name ?? "its destination"}…</StateBox
      >
    {/if}

    <dl class="m-0">
      {#snippet row(label: string, body: import("svelte").Snippet)}
        <div
          class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-rule px-gutter py-3"
          data-fact={label}
        >
          <dt class="text-small text-muted">{label}</dt>
          <dd class="m-0 min-w-0 break-words">{@render body()}</dd>
        </div>
      {/snippet}

      {#snippet tagged()}
        {#if one.triggerTag === undefined}
          none: picked when routing
        {:else}
          <Trigger tag={one.triggerTag} />
          <small class="block text-small text-muted">#{one.triggerTag}</small>
        {/if}
      {/snippet}
      {@render row("tag", tagged)}

      {#snippet where()}
        {#if destination === undefined}
          {one.destination}
          <small class="block text-small text-danger">deleted</small>
        {:else}
          <a href={openHref("destinations", destination.id)}
            >{destination.name}</a
          >
        {/if}
      {/snippet}
      {@render row("destination", where)}

      {#snippet did()}
        {capability !== undefined && carriesAssets(capability)
          ? "attachments only"
          : actionOf(one.capability)}
      {/snippet}
      {@render row("action", did)}

      {#snippet placed()}{place}{/snippet}
      {@render row("place", placed)}

      {#each asks as asked (asked.field)}
        {#snippet question()}
          asked each time
          <small class="block text-small text-muted"
            >{asked.default === undefined
              ? "no default"
              : `default ${asked.default}`}</small
          >
        {/snippet}
        {@render row(asked.label, question)}
      {/each}

      {#each taken as setting (setting.name)}
        {#snippet value()}{wordFor(setting.name, setting.said)}{/snippet}
        {@render row(labelFor({ name: setting.name }), value)}
      {/each}

      {#snippet missing()}
        {wordFor("folder", one.folder)}
        {#if one.folder === "establish"}
          <small class="block text-small text-muted"
            >{one.establishedAt === undefined
              ? "not established yet"
              : `established ${one.establishedAt.slice(0, 10)}`}</small
          >
        {/if}
      {/snippet}
      {@render row("if missing", missing)}

      {#snippet used()}
        {#if one.fired.records === 0}
          nothing yet
        {:else}
          {one.fired.records === 1
            ? "once"
            : `${String(one.fired.records)} times`}{one.fired.lastAt ===
          undefined
            ? ""
            : `, last ${one.fired.lastAt.slice(0, 10)}`}
        {/if}
      {/snippet}
      {@render row("used", used)}
    </dl>

    {#if report?.kind === "folder-missing"}
      <p class="m-0 px-gutter py-3 text-danger">
        Next delivery refused, and the item returns to the queue.
      </p>
    {/if}

    <Band>delete</Band>
    <LinkRow
      icon="trash"
      title="Delete…"
      line="Items already routed by it keep their records."
      danger
      chevron={false}
      disabled={offline}
      onclick={ondelete}
    />
  </div>

  <PageBar label={one.name}>
    {#if !stranded}
      <BarAction
        icon="refresh"
        label="Check again"
        disabled={asking || offline}
        onclick={oncheck}
      />
    {/if}
    <BarAction
      icon="edit"
      label="Edit"
      primary
      why={offline ? "The pool is out of reach." : undefined}
      href={editHref("templates", one.id)}
    />
  </PageBar>
</div>
