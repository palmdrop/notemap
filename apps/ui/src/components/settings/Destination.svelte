<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    saidBy,
    type Destination,
    type DestinationDescription,
    type DestinationProbe,
  } from "@notemap/client";

  import Band from "$components/primitives/blocks/Band.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import PageBar from "$components/primitives/frame/PageBar.svelte";
  import Facts from "$components/primitives/rows/Facts.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import StateBox from "$components/primitives/rows/StateBox.svelte";
  import Dialog from "$components/primitives/sheets/Dialog.svelte";
  import { client } from "$lib/client";
  import { alarming, standingOf } from "$lib/destination-state";
  import { headed } from "$lib/heading.svelte";
  import { kindName } from "$lib/looks";
  import { since } from "$lib/stamp";
  import { actionOf, type Fact } from "$lib/vocabulary";

  import { editHref, openHref, settingsHref } from "./href";

  /**
   * One destination on a page of its own: where it stands, what it can do and
   * what it is set to, the templates that file there, and Disable and Delete in
   * a band of their own. Check again and Edit are its bar.
   */
  let {
    one,
    described,
    probed,
    checkedAt,
    asking,
    probing,
    offline,
    oncheck,
    onretire,
    ondelete,
  }: {
    one: Destination;
    described?: DestinationDescription;
    probed?: DestinationProbe;
    checkedAt?: string;
    asking: boolean;
    probing: boolean;
    offline: boolean;
    oncheck: () => void;
    onretire: () => Promise<unknown>;
    ondelete: () => Promise<unknown>;
  } = $props();

  const templates = client.templates.all;

  const disabled = $derived(one.retired === true);
  const standing = $derived(
    standingOf(one, described, probed, asking || probing),
  );
  const checked = $derived(
    checkedAt === undefined ? "" : ` Checked ${since(checkedAt)}.`,
  );

  const filing = $derived(
    $templates.filter((each) => each.destination === one.id),
  );

  const facts = $derived.by((): Fact[] => [
    {
      label: "actions",
      value:
        described?.kind === "described"
          ? described.capabilities.map((each) => actionOf(each.name)).join(", ")
          : disabled
            ? "not offered, so not asked"
            : asking
              ? "asking…"
              : "none",
    },
    ...Object.entries(one.settings ?? {}).map(([key, value]) => ({
      label: key,
      value: String(value),
    })),
  ]);

  let busy = $state(false);
  let failed = $state("");
  let deleting = $state(false);
  let refusal = $state<string | undefined>(undefined);

  async function toggleRetire(): Promise<void> {
    busy = true;
    failed = "";
    try {
      await onretire();
    } catch (error) {
      failed = saidBy(error);
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    busy = true;
    refusal = undefined;
    try {
      await ondelete();
    } catch (error) {
      refusal = saidBy(error);
    } finally {
      busy = false;
    }
  }

  headed(() => ({
    title: one.name,
    out: {
      icon: "back",
      label: "Destinations",
      run: () => void goto(settingsHref("destinations")),
    },
    under: kindName(one.kind),
  }));
</script>

{#if deleting}
  <Dialog
    title="Delete {one.name}?"
    ways={[
      { label: "Keep", value: false },
      { label: "Delete", value: true, kind: "danger" },
    ]}
    onanswer={(yes) => {
      deleting = false;
      if (yes === true) void remove();
    }}
  >
    <p class="m-0">
      Only while no record names it. A destination something was routed to can
      be disabled instead.
    </p>
  </Dialog>
{/if}

<div class="flex flex-col">
  <div class="pb-4">
    {#if standing.word === "available"}
      <StateBox tone="good" icon="check">Available.{checked}</StateBox>
    {:else if standing.word === "checking"}
      <StateBox turning>Checking {one.name}…</StateBox>
    {:else if alarming(standing)}
      <StateBox tone="danger" icon="close">
        <b class="capitalize">{standing.word}:</b>
        {standing.why ?? ""}{checked}
      </StateBox>
    {:else if disabled}
      <StateBox icon="pause">
        Disabled. Not offered for new routes; what went there stays as it is.
      </StateBox>
    {/if}

    <Facts {facts} />

    {#if filing.length > 0}
      <div
        class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-rule px-gutter py-3"
      >
        <span class="text-small text-muted">templates</span>
        <span class="flex flex-wrap gap-x-3 gap-y-1">
          {#each filing as each (each.id)}
            <a href={openHref("templates", each.id)}>{each.name}</a>
          {/each}
        </span>
      </div>
    {/if}

    <Band>disable or delete</Band>
    <LinkRow
      icon="pause"
      title={disabled ? "Enable" : "Disable"}
      line={disabled
        ? "Offered for new routes again."
        : "Not offered for new routes. What went there, and what is on its way, stays as it is."}
      chevron={false}
      disabled={offline || busy}
      onclick={() => void toggleRetire()}
    />
    <LinkRow
      icon="trash"
      title="Delete…"
      line="Only while no record names it. Otherwise, disable it."
      danger
      chevron={false}
      disabled={offline || busy}
      onclick={() => (deleting = true)}
    />
    {#if failed !== ""}
      <p role="status" class="m-0 px-gutter py-3 text-danger">{failed}</p>
    {/if}
    {#if refusal !== undefined}
      <div class="px-gutter py-3 text-danger" role="status">
        <p class="m-0">{refusal}</p>
        {#if !disabled}
          <button
            type="button"
            class="mt-2 underline underline-offset-[0.2em]"
            onclick={() =>
              void toggleRetire().then(() => (refusal = undefined))}
            >Disable instead</button
          >
        {/if}
      </div>
    {/if}
  </div>

  <PageBar label={one.name}>
    <BarAction
      icon="refresh"
      label="Check again"
      disabled={offline || asking || probing || disabled}
      onclick={oncheck}
    />
    <BarAction
      icon="edit"
      label="Edit"
      primary
      why={offline ? "The pool is out of reach." : undefined}
      href={editHref("destinations", one.id)}
    />
  </PageBar>
</div>
