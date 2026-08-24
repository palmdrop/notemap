<script lang="ts">
  import {
    saidBy,
    type Destination,
    type DestinationDescription,
    type DestinationKind,
  } from "@notemap/client";

  import DestinationForm from "$components/destinations/DestinationForm.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Fact from "$components/primitives/register/Fact.svelte";
  import Facts from "$components/primitives/register/Facts.svelte";
  import Foot from "$components/primitives/register/Foot.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";

  const destinations = client.destinations.all;
  const pool = reachable();

  let kinds = $state<readonly DestinationKind[]>([]);
  let adding = $state(false);
  let editing = $state<string | undefined>(undefined);
  let said = $state("");

  /** Per destination rather than for the list: what one can do is I/O that may hang. */
  let described = $state<Record<string, DestinationDescription>>({});

  async function read() {
    try {
      [kinds] = [await client.destinations.kinds()];
      await client.destinations.load();
    } catch (error) {
      said = saidBy(error);
    }
  }

  // A screen opened while the daemon was down has no kinds and so no form to
  // add one with; coming back is the only moment anything will ask again.
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

  async function check(destination: Destination) {
    await attempt(async () => {
      described = {
        ...described,
        [destination.id]: await client.destinations.describe(destination.id),
      };
    });
  }

  function summary(report: DestinationDescription): string {
    return report.kind === "described"
      ? report.capabilities.map((each) => each.name).join(", ")
      : `${report.kind}: ${report.detail}`;
  }
</script>

{#if !pool.yes}
  <Rail>daemon</Rail>
  <Body>
    <!-- The chrome already says the pool is out of reach; this names the
         exception, and an ordinary condition is not painted as an alarm. -->
    <span role="status" class="font-mono text-ink-muted">
      destinations can be read but not changed
    </span>
  </Body>
{/if}

{#if said !== ""}
  <Rail>failed</Rail>
  <Body>
    <span role="status" class="font-mono text-accent">{said}</span>
  </Body>
{/if}

{#if $destinations.length === 0}
  <Rail>destinations</Rail>
  <Body>
    <span class="font-mono text-ink-muted">none yet</span>
  </Body>
{/if}

{#each $destinations as one (one.id)}
  <Rail>
    <div class="break-words">{one.name}</div>
    <Facts>
      <Fact name="kind">{one.kind}{one.retired ? " · retired" : ""}</Fact>
      <Fact name="can" empty={described[one.id] === undefined}>
        {described[one.id] === undefined
          ? "unasked"
          : summary(described[one.id])}
      </Fact>
    </Facts>
  </Rail>
  <Body>
    <ActionRow>
      <Action onclick={() => void check(one)}>check</Action>
      <Action
        disabled={!pool.yes}
        onclick={() => (editing = editing === one.id ? undefined : one.id)}
      >
        edit
      </Action>
      <Action
        disabled={!pool.yes}
        onclick={() =>
          void attempt(() =>
            one.retired
              ? client.destinations.unretire(one.id)
              : client.destinations.retire(one.id),
          )}
      >
        {one.retired ? "offer again" : "retire"}
      </Action>
      <!-- Offered whatever the pool will say: only it knows whether a record
           has ever named this, and its refusal is the answer. -->
      <Action
        disabled={!pool.yes}
        onclick={() => void attempt(() => client.destinations.delete(one.id))}
      >
        delete
      </Action>
    </ActionRow>

    {#if editing === one.id}
      <div class="mt-5">
        <DestinationForm
          {kinds}
          editing={one}
          disabled={!pool.yes}
          done={() => (editing = undefined)}
        />
      </div>
    {/if}
  </Body>
{/each}

{#if adding}
  <Rail>new</Rail>
  <Body>
    <DestinationForm {kinds} disabled={!pool.yes} done={() => (adding = false)} />
  </Body>
{:else}
  <Foot>
    <Action
      disabled={!pool.yes || kinds.length === 0}
      onclick={() => (adding = true)}
    >
      add a destination
    </Action>
  </Foot>
{/if}
