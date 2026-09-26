<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidBy,
    type Destination,
    type DestinationDescription,
    type DestinationKind,
    type DestinationProbe,
  } from "@notemap/client";

  import Unfolding from "$components/primitives/motion/Unfolding.svelte";
  import DestinationRow from "$components/settings/Destination.svelte";
  import DestinationForm from "$components/settings/DestinationForm.svelte";
  import Section from "$components/settings/Section.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";
  import { fade, slide } from "$lib/motion";

  const destinations = client.destinations.all;
  const pool = reachable();

  let kinds = $state<readonly DestinationKind[]>([]);
  let adding = $state(false);
  let opened = $state<string | undefined>(undefined);
  let editing = $state<string | undefined>(undefined);
  let showDisabled = $state(false);
  let said = $state("");

  /** Per destination rather than for the list: either question is I/O that may hang. */
  let described = $state<Record<string, DestinationDescription>>({});
  let probed = $state<Record<string, DestinationProbe>>({});
  let asking = $state<Record<string, boolean>>({});
  let reaching = $state<Record<string, boolean>>({});
  let checkedAt = $state<Record<string, string>>({});

  const disabled = $derived(
    $destinations.filter((one) => one.retired === true).length,
  );

  const shown = $derived(
    $destinations.filter((one) => showDisabled || one.retired !== true),
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

  async function check(one: Destination) {
    try {
      await Promise.all([describing(one), probing(one)]);
    } catch (error) {
      said = saidBy(error);
    } finally {
      checkedAt = { ...checkedAt, [one.id]: new Date().toISOString() };
    }
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

  // A disabled one is offered to nothing new, so nothing asks it anything.
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
          void probing(one)
            .then(() => {
              checkedAt = { ...checkedAt, [one.id]: new Date().toISOString() };
            })
            .catch(() => undefined);
        }
      }
    });
  });
</script>

<Section name="destinations">
  {#if !pool.yes}
    <!-- The chrome already says the pool is out of reach; this names what that
         costs here, and is not painted as an alarm. -->
    <p role="status" class="mt-4">Destinations can be read but not changed.</p>
  {/if}

  {#if said !== ""}
    <p role="status" class="mt-4 text-alarm">{said}</p>
  {/if}

  {#each shown as one (one.id)}
    <DestinationRow
      {one}
      described={described[one.id]}
      probed={probed[one.id]}
      checkedAt={checkedAt[one.id]}
      asking={asking[one.id] === true}
      probing={reaching[one.id] === true}
      opened={opened === one.id}
      editing={editing === one.id}
      offline={!pool.yes}
      onopen={() => {
        opened = opened === one.id ? undefined : one.id;
        editing = undefined;
      }}
      oncheck={() => void check(one)}
      onedit={() => (editing = editing === one.id ? undefined : one.id)}
      onretire={() =>
        one.retired
          ? client.destinations.unretire(one.id)
          : client.destinations.retire(one.id)}
      ondelete={() => client.destinations.delete(one.id)}
    >
      {#if editing === one.id}
        <Unfolding>
          <DestinationForm
            {kinds}
            existing={$destinations}
            editing={one}
            disabled={!pool.yes}
            done={() => (editing = undefined)}
          />
        </Unfolding>
      {/if}
    </DestinationRow>
  {/each}

  {#if adding}
    <Unfolding>
      <DestinationForm
        {kinds}
        existing={$destinations}
        disabled={!pool.yes}
        done={() => (adding = false)}
      />
    </Unfolding>
  {/if}

  <!-- `+ add` slides shut with its line as the form opens, as its siblings'
       do; where the line also carries the disabled ones it stays, and `+ add`
       fades out of it instead. -->
  {#if !adding || disabled > 0}
    <div
      class="mt-6 flex flex-wrap items-baseline justify-between gap-x-[2ch]"
      transition:slide={{ magnitude: "short" }}
    >
      {#if !adding}
        <span transition:fade>
          <Action
            disabled={!pool.yes || kinds.length === 0}
            onclick={() => (adding = true)}
          >
            + add a destination
          </Action>
        </span>
      {:else}
        <span></span>
      {/if}
      {#if disabled > 0}
        <Action onclick={() => (showDisabled = !showDisabled)}>
          {disabled} disabled · {showDisabled ? "hide" : "show"}
        </Action>
      {/if}
    </div>
  {/if}
</Section>
