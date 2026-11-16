<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidBy,
    type Destination,
    type DestinationDescription,
    type DestinationKind,
    type DestinationProbe,
  } from "@notemap/client";

  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  import PageBar from "$components/primitives/frame/PageBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import DestinationPage from "$components/settings/Destination.svelte";
  import DestinationForm from "$components/settings/DestinationForm.svelte";
  import Section from "$components/settings/Section.svelte";
  import { client } from "$lib/client";
  import { alarming, standingOf } from "$lib/destination-state";
  import { kindIcon, kindName } from "$lib/looks";
  import { reachable } from "$lib/reachable.svelte";

  import { openHref, newHref, settingsHref } from "./href";

  const destinations = client.destinations.all;
  const pool = reachable();

  let kinds = $state<readonly DestinationKind[]>([]);
  /** The list, one destination on its own page, or a form: read off the address. */
  const opened = $derived(page.url.searchParams.get("open") ?? undefined);
  const editing = $derived(page.url.searchParams.has("edit"));
  const adding = $derived(page.url.searchParams.has("new"));
  const one = $derived($destinations.find((each) => each.id === opened));

  /** A form done with gives way to what it was opened from, in its place in history. */
  function back(): void {
    void goto(
      opened === undefined || adding
        ? settingsHref("destinations")
        : openHref("destinations", opened),
      { replaceState: true },
    );
  }
  let said = $state("");

  /** Per destination rather than for the list: either question is I/O that may hang. */
  let described = $state<Record<string, DestinationDescription>>({});
  let probed = $state<Record<string, DestinationProbe>>({});
  let asking = $state<Record<string, boolean>>({});
  let reaching = $state<Record<string, boolean>>({});
  let checkedAt = $state<Record<string, string>>({});

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

{#if adding}
  <DestinationForm
    {kinds}
    existing={$destinations}
    disabled={!pool.yes}
    done={back}
  />
{:else if one !== undefined && editing}
  <DestinationForm
    {kinds}
    existing={$destinations}
    editing={one}
    disabled={!pool.yes}
    done={back}
  />
{:else if one !== undefined}
  <DestinationPage
    {one}
    described={described[one.id]}
    probed={probed[one.id]}
    checkedAt={checkedAt[one.id]}
    asking={asking[one.id] === true}
    probing={reaching[one.id] === true}
    offline={!pool.yes}
    oncheck={() => void check(one)}
    onretire={() =>
      one.retired
        ? client.destinations.unretire(one.id)
        : client.destinations.retire(one.id)}
    ondelete={async () => {
      await client.destinations.delete(one.id);
      await goto(settingsHref("destinations"), { replaceState: true });
    }}
  />
{:else}
  <Section name="destinations">
    <div class="flex flex-col">
      {#if !pool.yes}
        <!-- The chrome already says the pool is out of reach; this names what that
           costs here, and is not painted as an alarm. -->
        <p role="status" class="m-0 px-gutter py-3 text-small text-muted">
          The pool is out of reach. Destinations can be read but not changed.
        </p>
      {/if}

      {#if said !== ""}
        <p role="status" class="m-0 px-gutter py-3 text-danger">{said}</p>
      {/if}

      {#each $destinations as each (each.id)}
        {@const standing = standingOf(
          each,
          described[each.id],
          probed[each.id],
          asking[each.id] === true || reaching[each.id] === true,
        )}
        <LinkRow
          icon={kindIcon(each.kind)}
          title={each.name}
          label={each.name}
          line={kindName(each.kind)}
          end={standing.word}
          endDanger={alarming(standing)}
          muted={each.retired === true}
          href={openHref("destinations", each.id)}
        />
      {/each}

      <PageBar label="Destinations">
        <BarAction
          icon="plus"
          label="Add a destination"
          primary
          why={!pool.yes
            ? "The pool is out of reach."
            : kinds.length === 0
              ? "The pool has said no kinds yet."
              : undefined}
          href={newHref("destinations")}
        />
      </PageBar>
    </div>
  </Section>
{/if}
