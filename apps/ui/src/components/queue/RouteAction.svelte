<script lang="ts">
  import {
    saidBy,
    type Capability,
    type DestinationDescription,
  } from "@notemap/client";

  import { client } from "$lib/client";
  import { fieldsOf, valuesFrom } from "$lib/schema-form";

  let { item, disabled }: { item: string; disabled: boolean } = $props();

  const destinations = client.destinations.all;

  let open = $state(false);
  let chosen = $state<string | undefined>(undefined);
  let described = $state<DestinationDescription | undefined>(undefined);
  let capability = $state<string | undefined>(undefined);
  let target = $state<Record<string, string>>({});
  let said = $state("");
  let busy = $state(false);

  /** Retired means no longer offered for new routing; it stays in the list. */
  const offered = $derived($destinations.filter((one) => !one.retired));

  const capabilities = $derived<readonly Capability[]>(
    described?.kind === "described" ? described.capabilities : [],
  );

  const fields = $derived(
    fieldsOf(capabilities.find((one) => one.name === capability)?.targetSchema),
  );

  async function reveal() {
    open = !open;
    if (!open || $destinations.length > 0) return;

    try {
      await client.destinations.load();
    } catch (error) {
      said = saidBy(error);
    }
  }

  /**
   * The list says what exists; only this says what one can do, and it is I/O
   * that may hang on an unmounted drive — so it happens for the one chosen.
   */
  async function choose(id: string) {
    chosen = id === "" ? undefined : id;
    described = undefined;
    capability = undefined;
    target = {};
    if (chosen === undefined) return;

    said = "";
    try {
      described = await client.destinations.describe(chosen);
    } catch (error) {
      said = saidBy(error);
    }
  }

  async function send() {
    if (chosen === undefined || capability === undefined) return;

    busy = true;
    said = "routing…";
    try {
      const record = await client.routing.route(item, {
        destination: chosen,
        capability,
        target: valuesFrom(fields, target),
      });
      said = `routed — ${record.state}`;
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }
</script>

<button type="button" onclick={reveal} {disabled} class="underline">
  Route…
</button>

{#if open}
  <div class="mt-2 grid gap-2 text-sm">
    <select
      value={chosen ?? ""}
      onchange={(event) => void choose(event.currentTarget.value)}
      aria-label="Destination"
      class="rounded border px-2 py-1"
    >
      <option value="">Pick a destination</option>
      {#each offered as one (one.id)}
        <option value={one.id}>{one.name}</option>
      {/each}
    </select>

    {#if described !== undefined && described.kind !== "described"}
      <!-- Present and unavailable: a client cannot build a target until it
           describes itself again. -->
      <span role="status" class="text-neutral-500 dark:text-neutral-400">
        unavailable — {described.detail}
      </span>
    {/if}

    {#if capabilities.length > 0}
      <select
        value={capability ?? ""}
        onchange={(event) => {
          capability = event.currentTarget.value || undefined;
          target = {};
        }}
        aria-label="Capability"
        class="rounded border px-2 py-1"
      >
        <option value="">Pick what to do</option>
        {#each capabilities as one (one.name)}
          <option value={one.name}>{one.name}</option>
        {/each}
      </select>
    {/if}

    {#each fields as field (field.name)}
      <input
        bind:value={target[field.name]}
        placeholder={field.required ? `${field.name} (required)` : field.name}
        aria-label={field.name}
        class="rounded border px-2 py-1"
      />
    {/each}

    {#if capability !== undefined}
      <button
        type="button"
        onclick={send}
        disabled={busy}
        class="justify-self-start rounded border px-3 py-1 disabled:opacity-50"
      >
        Route
      </button>
    {/if}

    {#if said !== ""}
      <span role="status" class="text-neutral-500">{said}</span>
    {/if}
  </div>
{/if}
