<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidBy,
    type Destination as One,
    type DestinationDescription,
    type DestinationKind,
    type DestinationProbe,
  } from "@notemap/client";

  import Destination from "$components/settings/Destination.svelte";
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
  let doomed = $state<One | undefined>(undefined);
  let said = $state("");

  /** Per destination rather than for the list: what one can do is I/O that may hang. */
  let described = $state<Record<string, DestinationDescription>>({});
  let probed = $state<Record<string, DestinationProbe>>({});
  let asking = $state<Record<string, boolean>>({});

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

  async function check(one: One) {
    await attempt(() => Promise.all([describing(one), probing(one)]));
  }

  async function describing(one: One): Promise<void> {
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

  async function probing(one: One): Promise<void> {
    const answer = await client.destinations.probe(one.id);
    probed = { ...probed, [one.id]: answer };
  }

  /**
   * Asked per row rather than as one read of the list: both kinds shipped today
   * describe themselves without touching disk or network, but the first that
   * goes and looks must leave one row waiting rather than the page.
   *
   * A retired one is not asked — it is offered to nothing new — and one that
   * answered is not asked again, while one that could not is, since coming back
   * into reach is the moment that changes.
   */
  $effect(() => {
    const yes = pool.yes;
    const held = $destinations;
    if (!yes) return;

    untrack(() => {
      for (const one of held) {
        if (one.retired === true) continue;
        if (asking[one.id] === true) continue;

        // Quietly: a pool out of reach is already said by the chrome, and one
        // line per destination saying it again is not news. Each is asked on
        // its own, so an answer already held is not asked for twice.
        if (described[one.id]?.kind !== "described") {
          void describing(one).catch(() => undefined);
        }
        if (probed[one.id] === undefined) {
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
    <Destination
      {one}
      described={described[one.id]}
      probed={probed[one.id]}
      asking={asking[one.id] === true}
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
    </Destination>
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
        await client.destinations.delete((doomed as One).id);
        doomed = undefined;
      })}
    onretire={() =>
      void attempt(async () => {
        await client.destinations.retire((doomed as One).id);
        doomed = undefined;
      })}
  />
{/if}
