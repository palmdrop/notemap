<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidBy,
    type Destination,
    type DestinationDescription,
    type DestinationKind,
    type DestinationProbe,
  } from "@notemap/client";

  import DestinationRow from "$components/settings/Destination.svelte";
  import DestinationForm from "$components/settings/DestinationForm.svelte";
  import Doomed from "$components/settings/Doomed.svelte";
  import Section from "$components/settings/Section.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";

  const destinations = client.destinations.all;
  const pool = reachable();

  let kinds = $state<readonly DestinationKind[]>([]);
  let adding = $state(false);
  let opened = $state<string | undefined>(undefined);
  let editing = $state<string | undefined>(undefined);
  let doomed = $state<Destination | undefined>(undefined);
  let said = $state("");

  /** Per destination rather than for the list: either question is I/O that may hang. */
  let described = $state<Record<string, DestinationDescription>>({});
  let probed = $state<Record<string, DestinationProbe>>({});
  let asking = $state<Record<string, boolean>>({});
  let reaching = $state<Record<string, boolean>>({});

  const tally = $derived(
    (() => {
      const offered = $destinations.filter(
        (one) => one.retired !== true,
      ).length;
      const retired = $destinations.length - offered;
      if ($destinations.length === 0) return "none yet";
      return retired === 0
        ? `${offered} offered`
        : `${offered} offered · ${retired} retired`;
    })(),
  );

  async function read() {
    try {
      [kinds] = [await client.destinations.kinds()];
      await client.destinations.load();
    } catch (error) {
      said = saidBy(error);
    }
  }

  // A page opened while the daemon was down has no kinds and so no form to add
  // one with; coming back is the only moment anything will ask again.
  $effect(() => {
    if (pool.yes && kinds.length === 0) void read();
  });

  async function attempt(what: () => Promise<unknown>) {
    said = "";
    try {
      await what();
    } catch (error) {
      said = saidBy(error);
    }
  }

  async function check(one: Destination) {
    await attempt(() => Promise.all([describing(one), probing(one)]));
  }

  async function describing(one: Destination): Promise<void> {
    asking = { ...asking, [one.id]: true };
    try {
      // Read after the answer, never spread around the await: two rows asking
      // at once both spread the same record and the slower one wins.
      const answer = await client.destinations.describe(one.id);
      described = { ...described, [one.id]: answer };
    } finally {
      asking = { ...asking, [one.id]: false };
    }
  }

  async function probing(one: Destination): Promise<void> {
    reaching = { ...reaching, [one.id]: true };
    try {
      const answer = await client.destinations.probe(one.id);
      probed = { ...probed, [one.id]: answer };
    } finally {
      reaching = { ...reaching, [one.id]: false };
    }
  }

  /** Anything else is worth asking again when the pool comes back into reach. */
  const SETTLED: readonly DestinationProbe["kind"][] = [
    "ready",
    "rejected",
    "not-offered",
  ];

  // A retired one is offered to nothing new, so nothing asks it anything.
  // Refusals stay quiet: a pool out of reach is already said by the chrome.
  $effect(() => {
    const yes = pool.yes;
    const held = $destinations;
    if (!yes) return;

    untrack(() => {
      for (const one of held) {
        if (one.retired === true) continue;

        if (
          asking[one.id] !== true &&
          described[one.id]?.kind !== "described"
        ) {
          void describing(one).catch(() => undefined);
        }

        const answer = probed[one.id];
        const settled = answer !== undefined && SETTLED.includes(answer.kind);
        if (reaching[one.id] !== true && !settled) {
          void probing(one).catch(() => undefined);
        }
      }
    });
  });
</script>

<Section name="destinations" aside={tally}>
  {#if !pool.yes}
    <!-- The chrome already says the pool is out of reach; this names what that
         costs here, and is not painted as an alarm. -->
    <p role="status" class="mt-4 text-ink-muted">
      Destinations can be read but not changed.
    </p>
  {/if}

  <!-- A refusal about the one being deleted is shown in the asking instead. -->
  {#if said !== "" && doomed === undefined}
    <p role="status" class="mt-4 text-accent">{said}</p>
  {/if}

  {#each $destinations as one (one.id)}
    <DestinationRow
      {one}
      described={described[one.id]}
      probed={probed[one.id]}
      asking={asking[one.id] === true}
      probing={reaching[one.id] === true}
      opened={opened === one.id}
      offline={!pool.yes}
      onopen={() => {
        opened = opened === one.id ? undefined : one.id;
        editing = undefined;
      }}
      oncheck={() => void check(one)}
      onedit={() => (editing = editing === one.id ? undefined : one.id)}
      onretire={() =>
        void attempt(() =>
          one.retired
            ? client.destinations.unretire(one.id)
            : client.destinations.retire(one.id),
        )}
      ondelete={() => (doomed = one)}
    >
      {#if editing === one.id}
        <div class="mt-5">
          <DestinationForm
            {kinds}
            existing={$destinations}
            editing={one}
            disabled={!pool.yes}
            done={() => (editing = undefined)}
          />
        </div>
      {/if}
    </DestinationRow>
  {/each}

  {#if adding}
    <DestinationForm
      {kinds}
      existing={$destinations}
      disabled={!pool.yes}
      done={() => (adding = false)}
    />
  {:else}
    <div class="mt-6">
      <Action
        disabled={!pool.yes || kinds.length === 0}
        onclick={() => (adding = true)}
      >
        <span aria-hidden="true" class="text-ink-muted">+</span> Add a destination
      </Action>
    </div>
  {/if}
</Section>

{#if doomed !== undefined}
  <Doomed
    one={doomed}
    {said}
    onclose={() => {
      doomed = undefined;
      said = "";
    }}
    ondelete={() =>
      void attempt(async () => {
        await client.destinations.delete((doomed as Destination).id);
        doomed = undefined;
      })}
    onretire={() =>
      void attempt(async () => {
        await client.destinations.retire((doomed as Destination).id);
        doomed = undefined;
      })}
  />
{/if}
