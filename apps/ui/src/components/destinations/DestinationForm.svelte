<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidBy,
    type Destination,
    type DestinationKind,
  } from "@notemap/client";

  import { client } from "$lib/client";
  import { fieldsOf, typedFrom, valuesFrom } from "$lib/schema-form";

  let {
    kinds,
    editing,
    disabled,
    done,
  }: {
    kinds: readonly DestinationKind[];
    /** Absent adds a new destination; present edits that one, kind fixed. */
    editing?: Destination;
    disabled: boolean;
    done: () => void;
  } = $props();

  // Where the form starts rather than what it holds, so nothing changes under
  // somebody who is typing.
  let name = $state(untrack(() => editing?.name ?? ""));
  let typed = $state(untrack(() => typedFrom(editing?.settings)));
  let said = $state("");
  let busy = $state(false);

  /** An existing destination's kind is fixed; a new one starts at the first. */
  let chosen = $derived(editing?.kind ?? kinds[0]?.name);

  const fields = $derived(
    fieldsOf(kinds.find((one) => one.name === chosen)?.settingsSchema),
  );

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (chosen === undefined) return;

    busy = true;
    said = "";
    try {
      const settings = valuesFrom(fields, typed);
      if (editing === undefined) {
        await client.destinations.create({ name, kind: chosen, settings });
      } else {
        await client.destinations.update(editing.id, { name, settings });
      }
      done();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={submit} class="text-sm mt-3 grid gap-2">
  <input
    bind:value={name}
    placeholder="Name"
    aria-label="Name"
    required
    class="rounded border px-2 py-1"
  />

  {#if editing === undefined}
    <select
      bind:value={chosen}
      onchange={() => (typed = {})}
      aria-label="Kind"
      class="rounded border px-2 py-1"
    >
      {#each kinds as one (one.name)}
        <option value={one.name}>{one.name}</option>
      {/each}
    </select>
  {:else}
    <!-- Changing it would make one destination two, and a record cannot tell
         which it meant. -->
    <p class="text-neutral-500 dark:text-neutral-400">Kind: {editing.kind}</p>
  {/if}

  {#each fields as field (field.name)}
    <input
      bind:value={typed[field.name]}
      placeholder={field.required ? `${field.name} (required)` : field.name}
      aria-label={field.name}
      class="rounded border px-2 py-1"
    />
  {/each}

  <div class="flex gap-2">
    <button
      type="submit"
      disabled={busy || disabled}
      class="rounded border px-3 py-1 disabled:opacity-50"
    >
      {editing === undefined ? "Add" : "Save"}
    </button>
    <button type="button" onclick={done} class="px-3 py-1 underline">
      Cancel
    </button>
  </div>

  {#if said !== ""}
    <span role="status" class="text-red-700 dark:text-red-300">{said}</span>
  {/if}
</form>
