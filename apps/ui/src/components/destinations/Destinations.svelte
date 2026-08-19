<script lang="ts">
  import {
    saidBy,
    type Destination,
    type DestinationDescription,
    type DestinationKind,
  } from "@notemap/client";

  import DestinationForm from "$components/destinations/DestinationForm.svelte";
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

<h2 class="mt-8 text-base font-medium">Destinations</h2>

{#if !pool.yes}
  <p class="mt-2 text-sm text-neutral-500 dark:text-neutral-400" role="status">
    the daemon is not reachable; destinations can be read but not changed
  </p>
{/if}

{#if said !== ""}
  <p class="mt-2 text-sm text-red-700 dark:text-red-300" role="status">
    {said}
  </p>
{/if}

{#if $destinations.length === 0}
  <p class="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
    No destinations yet.
  </p>
{:else}
  <ul class="mt-4 grid list-none gap-4 p-0">
    {#each $destinations as one (one.id)}
      <li class="grid gap-1 border-t pt-3 text-sm">
        <span class="font-medium">
          {one.name}
          <span class="font-normal text-neutral-500 dark:text-neutral-400">
            · {one.kind}{one.retired ? " · retired" : ""}
          </span>
        </span>

        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            onclick={() => void check(one)}
            class="underline"
          >
            Check
          </button>
          <button
            type="button"
            disabled={!pool.yes}
            onclick={() => (editing = editing === one.id ? undefined : one.id)}
            class="underline disabled:opacity-50"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={!pool.yes}
            onclick={() =>
              void attempt(() =>
                one.retired
                  ? client.destinations.unretire(one.id)
                  : client.destinations.retire(one.id),
              )}
            class="underline disabled:opacity-50"
          >
            {one.retired ? "Offer again" : "Retire"}
          </button>
          <!-- Offered whatever the pool will say: only it knows whether a
               record has ever named this, and its refusal is the answer. -->
          <button
            type="button"
            disabled={!pool.yes}
            onclick={() =>
              void attempt(() => client.destinations.delete(one.id))}
            class="underline disabled:opacity-50"
          >
            Delete
          </button>
        </div>

        {#if described[one.id] !== undefined}
          <span class="text-neutral-500 dark:text-neutral-400">
            {summary(described[one.id])}
          </span>
        {/if}

        {#if editing === one.id}
          <DestinationForm
            {kinds}
            editing={one}
            disabled={!pool.yes}
            done={() => (editing = undefined)}
          />
        {/if}
      </li>
    {/each}
  </ul>
{/if}

{#if adding}
  <DestinationForm {kinds} disabled={!pool.yes} done={() => (adding = false)} />
{:else}
  <button
    type="button"
    disabled={!pool.yes || kinds.length === 0}
    onclick={() => (adding = true)}
    class="mt-4 rounded-lg border px-4 py-1.5 text-sm disabled:opacity-50"
  >
    Add a destination
  </button>
{/if}
