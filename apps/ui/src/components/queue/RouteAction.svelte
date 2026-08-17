<script lang="ts">
  import { saidBy, type Capability, type Destination } from "@notemap/client";

  import { client } from "$lib/client";

  let { item, disabled }: { item: string; disabled: boolean } = $props();

  let open = $state(false);
  let destinations = $state<readonly Destination[]>([]);
  let chosen = $state<string | undefined>(undefined);
  let capability = $state<string | undefined>(undefined);
  let target = $state<Record<string, string>>({});
  let said = $state("");
  let busy = $state(false);

  const described = $derived(
    destinations.filter((one) => one.kind === "described"),
  );

  const capabilities = $derived(
    described.find((one) => one.id === chosen)?.capabilities ?? [],
  );

  const fields = $derived(
    fieldsOf(capabilities.find((one) => one.name === capability)),
  );

  /** A capability's target schema is the whole of what a client needs to build one. */
  function fieldsOf(
    one: Capability | undefined,
  ): readonly { name: string; required: boolean }[] {
    const schema = one?.targetSchema;
    const properties = schema?.["properties"];
    if (properties === null || typeof properties !== "object") return [];

    const required = Array.isArray(schema?.["required"])
      ? (schema["required"] as unknown[])
      : [];

    return Object.keys(properties).map((name) => ({
      name,
      required: required.includes(name),
    }));
  }

  async function reveal() {
    open = !open;
    if (!open || destinations.length > 0) return;

    try {
      destinations = await client.routing.destinations();
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
        target: Object.fromEntries(
          Object.entries(target).filter(([, value]) => value !== ""),
        ),
      });
      said = `routed — ${record.state}`;
      await client.loadQueue();
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
    <select bind:value={chosen} class="rounded border px-2 py-1">
      <option value={undefined}>Pick a destination</option>
      {#each described as one (one.id)}
        <option value={one.id}>{one.id}</option>
      {/each}
    </select>

    {#if capabilities.length > 0}
      <select bind:value={capability} class="rounded border px-2 py-1">
        <option value={undefined}>Pick what to do</option>
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
