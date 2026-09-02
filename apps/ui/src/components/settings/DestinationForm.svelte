<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidBy,
    type Destination,
    type DestinationKind,
  } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { isFamiliarRoot } from "$lib/roots";
  import {
    fieldsOf,
    typedFrom,
    valuesFrom,
    type Field,
  } from "$lib/schema-form";

  let {
    kinds,
    existing,
    editing,
    disabled,
    done,
  }: {
    kinds: readonly DestinationKind[];
    /** What a root is checked against — every destination the pool already holds. */
    existing: readonly Destination[];
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

  // "root" rather than every field a kind might offer: it is the one shape a
  // typo turns into somewhere else entirely, which nothing else here is.
  const typedRoot = $derived(
    fields.some((field) => field.name === "root")
      ? (typed["root"] ?? "")
      : undefined,
  );

  const knownRoots = $derived(
    existing
      .filter((one) => one.kind === chosen)
      .map((one) => one.settings["root"])
      .filter((root): root is string => typeof root === "string"),
  );

  // A check against a mistake, not a permission: it authenticates nobody,
  // since whoever can create a destination over `/v1` can already write the
  // same root there directly. Submitting is what confirms it — the warning
  // and the button's own wording are what make that a choice rather than an
  // accident.
  const unfamiliarRoot = $derived(
    typedRoot !== undefined &&
      typedRoot.trim() !== "" &&
      !isFamiliarRoot(typedRoot, knownRoots),
  );

  /**
   * What the kind published, plus whatever this destination already holds: a
   * value the daemon no longer declares would otherwise be rewritten to
   * whichever name happens to sort first, silently, by opening the form.
   * Nothing held yet is offered as the blank the browser then refuses to
   * submit, rather than as a default nobody chose.
   */
  function offered(field: Field): readonly { value: string; label: string }[] {
    const published = (field.examples ?? []).map((value) => ({
      value,
      label: value,
    }));
    const held = typed[field.name] ?? "";

    if (held === "") return [{ value: "", label: "—" }, ...published];

    return published.some((one) => one.value === held)
      ? published
      : [...published, { value: held, label: `${held} — not declared` }];
  }

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
      {#if field.description !== undefined}
        <p class="text-ink-muted">{field.description}</p>
      {/if}
      {#if field.examples !== undefined}
        <select
          bind:value={typed[field.name]}
          aria-label={field.name}
          required={field.required}
          class="mt-0.5 block w-full cursor-pointer appearance-none border-b border-ink bg-transparent py-0.5 font-mono"
        >
          {#each offered(field) as one (one.value)}
            <option value={one.value}>{one.label}</option>
          {/each}
        </select>
      {:else}
        <input
          bind:value={typed[field.name]}
          aria-label={field.name}
          class="mt-0.5 block w-full border-b border-ink bg-transparent py-0.5 font-mono"
        />
      {/if}
    </label>
  {/each}

  {#if unfamiliarRoot}
    <p role="status" class="text-ink-muted">
      notemap has not used <span class="text-ink">{typedRoot}</span> before — check
      it names the right place.
    </p>
  {/if}

  <div class="mt-3 flex items-baseline gap-x-6">
    <span class="inverted">
      <Action submit disabled={busy || disabled}>
        {unfamiliarRoot
          ? "Use it anyway"
          : editing === undefined
            ? "Create it"
            : "Save it"}
      </Action>
    </span>
    <Action onclick={done}>Cancel</Action>
    {#if said !== ""}
      <span role="status" class="text-accent">{said}</span>
    {/if}
  </div>
</form>
