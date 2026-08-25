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
    editing?: Destination;
    disabled: boolean;
    done: () => void;
  } = $props();

  // Where the form starts, not what it holds: nothing changes under a typist.
  let name = $state(untrack(() => editing?.name ?? ""));
  let typed = $state(untrack(() => typedFrom(editing?.settings)));
  let said = $state("");
  let busy = $state(false);

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

<form
  onsubmit={submit}
  class="mt-6 grid gap-3 border-l-2 border-l-ink bg-ink/[0.03] py-4 pr-5 pl-5 font-mono"
>
  <div class="tracking-[0.3em] text-ink-muted uppercase">
    {editing === undefined ? "a new destination" : "editing"}
  </div>

  <label class="mt-2 block">
    <span class="text-ink-muted">name</span>
    <input
      bind:value={name}
      aria-label="Name"
      required
      class="mt-0.5 block w-full border-b border-ink bg-transparent py-0.5 font-mono"
    />
  </label>

  {#if editing === undefined}
    <label class="block">
      <span class="text-ink-muted">kind</span>
      <select
        bind:value={chosen}
        onchange={() => (typed = {})}
        aria-label="Kind"
        class="mt-0.5 block w-full cursor-pointer appearance-none border-b border-ink bg-transparent py-0.5 font-mono"
      >
        {#each kinds as one (one.name)}
          <option value={one.name}>{one.name}</option>
        {/each}
      </select>
    </label>
  {:else}
    <!-- Changing it would make one destination two, and a record cannot tell
         which it meant. -->
    <div>
      <span class="text-ink-muted">kind</span>
      {editing.kind}
    </div>
  {/if}

  <!-- The kind's own names, so the label read is the label an error will name. -->
  {#each fields as field (field.name)}
    <label class="block">
      <span class="text-ink-muted">
        {field.name}{field.required ? "" : " (optional)"}
      </span>
      <input
        bind:value={typed[field.name]}
        aria-label={field.name}
        class="mt-0.5 block w-full border-b border-ink bg-transparent py-0.5 font-mono"
      />
    </label>
  {/each}

  <div class="mt-3 flex items-baseline gap-x-6">
    <span class="inverted">
      <Action submit disabled={busy || disabled}>
        {editing === undefined ? "Create it" : "Save it"}
      </Action>
    </span>
    <Action onclick={done}>Cancel</Action>
    {#if said !== ""}
      <span role="status" class="text-accent">{said}</span>
    {/if}
  </div>
</form>
