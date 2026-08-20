<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidBy,
    type Destination,
    type DestinationKind,
  } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
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

<form onsubmit={submit} class="grid gap-3 font-mono">
  <input
    bind:value={name}
    placeholder="name"
    aria-label="Name"
    required
    class="border-b border-ink bg-transparent font-mono placeholder:text-ink-muted"
  />

  {#if editing === undefined}
    <select
      bind:value={chosen}
      onchange={() => (typed = {})}
      aria-label="Kind"
      class="cursor-pointer appearance-none border-b border-ink bg-transparent font-mono"
    >
      {#each kinds as one (one.name)}
        <option value={one.name}>{one.name}</option>
      {/each}
    </select>
  {:else}
    <!-- Changing it would make one destination two, and a record cannot tell
         which it meant. -->
    <span class="text-ink-muted">kind: {editing.kind}</span>
  {/if}

  {#each fields as field (field.name)}
    <input
      bind:value={typed[field.name]}
      placeholder={field.required ? `${field.name} (required)` : field.name}
      aria-label={field.name}
      class="border-b border-ink bg-transparent font-mono placeholder:text-ink-muted"
    />
  {/each}

  <div class="flex gap-x-gap">
    <Action primary submit disabled={busy || disabled}>
      {editing === undefined ? "add" : "save"}
    </Action>
    <Action onclick={done}>cancel</Action>
    {#if said !== ""}
      <span role="status" class="text-accent">{said}</span>
    {/if}
  </div>
</form>
