<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidBy,
    type Destination,
    type DestinationKind,
  } from "@notemap/client";

  import Band from "$components/primitives/blocks/Band.svelte";
  import Segmented from "$components/primitives/blocks/Segmented.svelte";
  import { client } from "$lib/client";
  import { headed } from "$lib/heading.svelte";
  import { kindName } from "$lib/looks";
  import { isFamiliarRoot } from "$lib/roots";
  import FormBar from "./form/FormBar.svelte";
  import Guard from "./form/Guard.svelte";
  import SchemaField from "./form/SchemaField.svelte";
  import {
    effectiveOf,
    fieldsOf,
    offered as meaningful,
    typedFrom,
    valuesFrom,
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

  const declared = $derived(
    fieldsOf(kinds.find((one) => one.name === chosen)?.settingsSchema),
  );

  /** Only the settings that mean something given the others; what a hidden one held is not sent. */
  const fields = $derived(
    declared.filter((one) => meaningful(one, effectiveOf(declared, typed))),
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

  /** Why it cannot be saved yet, said over Save rather than leaving it dead. */
  const missing = $derived.by(() => {
    if (name.trim() === "") return "Name it to save.";
    if (chosen === undefined) return "Pick a kind to save.";
    const empty = fields.find(
      (field) =>
        field.required &&
        field.preset === undefined &&
        (typed[field.name] ?? "").trim() === "",
    );
    if (disabled) return "The pool is out of reach.";
    return empty === undefined ? undefined : `Fill in ${empty.name} to save.`;
  });

  const started = untrack(() => JSON.stringify([name, typed]));
  let saved = false;
  const changed = (): boolean =>
    !saved && JSON.stringify([name, typed]) !== started;

  headed(() => ({
    title: editing === undefined ? "new destination" : "edit destination",
    out: { icon: "close", label: "Cancel", run: done },
    ...(editing === undefined ? {} : { under: editing.name }),
  }));

  async function submit(event?: SubmitEvent) {
    event?.preventDefault();
    if (chosen === undefined || missing !== undefined || busy) return;

    busy = true;
    said = "";
    try {
      const settings = valuesFrom(fields, typed);
      if (editing === undefined) {
        await client.destinations.create({ name, kind: chosen, settings });
      } else {
        await client.destinations.update(editing.id, { name, settings });
      }
      saved = true;
      done();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }
</script>

<Guard about={editing?.name ?? "a new destination"} {changed} />

<form onsubmit={submit} data-settings>
  <Band>destination</Band>
  <label class="block border-b border-rule px-gutter py-3">
    <span class="mb-1.5 block text-small">name</span>
    <input
      bind:value={name}
      aria-label="Name"
      required
      placeholder="what it is called when routing"
      class="min-h-11 w-full rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
    />
  </label>

  <div class="border-b border-rule px-gutter py-3">
    <span class="mb-1.5 block text-small">kind</span>
    {#if editing === undefined}
      <Segmented
        label="kind"
        value={chosen}
        options={kinds.map((one) => ({
          value: one.name,
          word: kindName(one.name),
        }))}
        onchoose={(one) => {
          chosen = one;
          typed = {};
        }}
      />
    {:else}
      <!-- Changing it would make one destination two, and a record cannot tell
           which it meant. -->
      <p class="m-0">{kindName(editing.kind)}</p>
      <p class="mt-1.5 mb-0 text-small text-muted">
        A kind can't change once made: a record couldn't tell which destination
        it meant.
      </p>
    {/if}
  </div>

  {#if chosen !== undefined && fields.length > 0}
    <Band>{kindName(chosen)}</Band>
    {#each fields as field (field.name)}
      <SchemaField
        {field}
        label={field.name}
        value={typed[field.name] ?? ""}
        onchange={(value) => (typed[field.name] = value)}
      />
    {/each}
  {/if}

  {#if unfamiliarRoot}
    <p role="status" class="m-0 px-gutter py-3">
      notemap has not used {typedRoot} before. Check it names the right place; Save
      uses it as typed.
    </p>
  {/if}

  {#if said !== ""}
    <p role="status" class="m-0 px-gutter py-3 text-danger">{said}</p>
  {/if}
</form>

<FormBar {missing} {busy} oncancel={done} onsave={() => void submit()} />
