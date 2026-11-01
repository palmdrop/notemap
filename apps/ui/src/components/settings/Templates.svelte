<script lang="ts">
  import { untrack } from "svelte";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";

  import {
    saidBy,
    type RoutingTemplate,
    type RoutingTemplateReport,
  } from "@notemap/client";

  import Unfolding from "$components/primitives/motion/Unfolding.svelte";
  import TemplateRow from "$components/settings/Template.svelte";
  import TemplateForm from "$components/settings/TemplateForm.svelte";
  import Section from "$components/settings/Section.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";
  import { slide } from "$lib/motion";
  import { draftOf, type RoutingTemplateDraft } from "$lib/template-draft";

  const templates = client.templates.all;
  const destinations = client.destinations.all;
  const pool = reachable();

  let adding = $state(false);
  let opened = $state<string | undefined>(undefined);
  let editing = $state<string | undefined>(undefined);
  let doomed = $state<RoutingTemplate | undefined>(undefined);
  let said = $state("");

  /** A routing record this was opened from, to be saved as a template. */
  const from = $derived({
    item: page.url.searchParams.get("item"),
    record: page.url.searchParams.get("record"),
  });
  let starting = $state<RoutingTemplateDraft | undefined>(undefined);
  let unfound = $state(false);

  // Read once the pool answers: the records are the pool's, and the draft says
  // nothing until the destinations it names are held.
  $effect(() => {
    const { item, record } = from;
    if (item === null || record === null || !pool.yes) return;
    let live = true;

    void (async () => {
      try {
        const [read, records] = await Promise.all([
          client.item(item),
          client.routing.recordsFor(item),
          client.destinations.load(),
        ]);
        if (!live) return;
        const found = records.find((one) => one.id === record);
        starting =
          found === undefined || read.item === undefined
            ? undefined
            : draftOf(found, read.item, client.destinations.held);
        unfound = starting === undefined;
      } catch (error) {
        if (live) said = saidBy(error);
      }
    })();

    return () => {
      live = false;
    };
  });

  /** Saved or let go, the address stops saying what to start from. */
  function started(): void {
    starting = undefined;
    const url = new URL(page.url);
    url.searchParams.delete("item");
    url.searchParams.delete("record");
    replaceState(url, {});
  }

  /** Per template rather than for the list: the question is I/O that may hang. */
  let reports = $state<Record<string, RoutingTemplateReport>>({});
  let asking = $state<Record<string, boolean>>({});

  async function read() {
    try {
      await Promise.all([client.templates.load(), client.destinations.load()]);
    } catch (error) {
      said = saidBy(error);
    }
  }

  $effect(() => {
    if (pool.yes) void read();
  });

  async function asks(one: RoutingTemplate): Promise<void> {
    asking = { ...asking, [one.id]: true };
    try {
      // Read after the answer, never spread around the await: two rows asking
      // at once both spread the same record and the slower one wins.
      const answer = await client.templates.report(one.id);
      reports = { ...reports, [one.id]: answer };
    } finally {
      asking = { ...asking, [one.id]: false };
    }
  }

  /** Anything else is worth asking again when the pool comes back into reach. */
  const SETTLED: readonly RoutingTemplateReport["kind"][] = [
    "fits",
    "stranded",
    "destination-retired",
    "capability-undeclared",
    "arguments-invalid",
    "folder-missing",
    "destination-unusable",
  ];

  // Asked per row as the page draws, so the first template whose destination
  // has to go and look does not hold up a list already drawn from pool state.
  $effect(() => {
    const yes = pool.yes;
    const held = $templates;
    if (!yes) return;

    untrack(() => {
      for (const one of held) {
        const answer = reports[one.id];
        const settled = answer !== undefined && SETTLED.includes(answer.kind);
        if (asking[one.id] !== true && !settled) {
          void asks(one).catch(() => undefined);
        }
      }
    });
  });

  async function attempt(what: () => Promise<unknown>) {
    said = "";
    try {
      await what();
    } catch (error) {
      said = saidBy(error);
    }
  }
</script>

<Section name="templates">
  {#if !pool.yes}
    <!-- The chrome already says the pool is out of reach; this names what that
         costs here, and is not painted as an alarm. -->
    <p role="status" class="mt-4">Templates can be read but not changed.</p>
  {/if}

  {#if said !== ""}
    <p role="status" class="mt-4 text-alarm">{said}</p>
  {/if}

  {#if unfound}
    <p role="status" class="mt-4">
      That routing record cannot be saved as a template.
    </p>
  {/if}

  {#if starting !== undefined}
    <Unfolding>
      <TemplateForm
        destinations={$destinations}
        {starting}
        disabled={!pool.yes}
        done={started}
      />
    </Unfolding>
  {/if}

  {#each $templates as one (one.id)}
    <TemplateRow
      {one}
      destination={$destinations.find((each) => each.id === one.destination)}
      report={reports[one.id]}
      asking={asking[one.id] === true}
      opened={opened === one.id}
      editing={editing === one.id}
      offline={!pool.yes}
      onopen={() => {
        opened = opened === one.id ? undefined : one.id;
        editing = undefined;
      }}
      oncheck={() => void asks(one)}
      onedit={() => (editing = editing === one.id ? undefined : one.id)}
      ondelete={() => (doomed = one)}
    >
      {#if editing === one.id}
        <Unfolding>
          <TemplateForm
            destinations={$destinations}
            editing={one}
            disabled={!pool.yes}
            done={() => (editing = undefined)}
          />
        </Unfolding>
      {/if}
    </TemplateRow>
  {/each}

  {#if adding}
    <Unfolding>
      <TemplateForm
        destinations={$destinations}
        disabled={!pool.yes}
        done={() => (adding = false)}
      />
    </Unfolding>
  {:else}
    <div class="mt-6" transition:slide={{ magnitude: "short" }}>
      <Action
        disabled={!pool.yes || $destinations.length === 0}
        onclick={() => (adding = true)}
      >
        + add a template
      </Action>
    </div>
  {/if}
</Section>

{#if doomed !== undefined}
  <!-- Deleting a template is not the irreversible thing deleting a destination
       is: a record made from one keeps resolving without it. So it asks in a
       line rather than in a modal. -->
  <div role="dialog" aria-label="Delete a template" class="mt-4 text-alarm">
    <p>
      Delete {doomed.name}? Records made from it keep resolving; its tag stops
      filing anything.
    </p>
    <div class="mt-2 flex flex-wrap items-baseline gap-x-6">
      <Action
        onclick={() =>
          void attempt(async () => {
            await client.templates.delete((doomed as RoutingTemplate).id);
            doomed = undefined;
          })}
      >
        delete anyway
      </Action>
      <Action onclick={() => (doomed = undefined)}>keep</Action>
    </div>
  </div>
{/if}
