<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidBy,
    type Destination,
    type DestinationKind,
  } from "@notemap/client";

  import Option from "$components/primitives/composer/Option.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { isFamiliarRoot } from "$lib/roots";
  import {
    effectiveOf,
    fieldsOf,
    labelOf,
    offered as meaningful,
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

  const FIELD =
    "w-full border-b border-ink bg-transparent px-0 py-0.5 outline-none";

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

  /**
   * The values the schema allows, or failing that the ones it suggests. Both
   * are drawn the same way; what differs is only whether typing something else
   * would be refused, which the pool answers either way.
   */
  const listed = (field: Field): readonly string[] | undefined =>
    field.options ?? field.examples;

  // A value the daemon no longer declares is carried rather than dropped:
  // otherwise opening the form rewrites the setting to whichever name sorts
  // first, silently, and moves the destination somewhere nobody chose.
  function offered(field: Field): readonly string[] {
    const published = listed(field) ?? [];
    const held = typed[field.name] ?? "";

    // An optional field keeps the empty option whatever it holds: absent is a
    // value of its own there — it means *inherit* — and a field that could be
    // left unset but never returned to unset is a one-way door. Blank leads,
    // because that is what a destination that never said this has.
    const blank =
      field.preset !== undefined
        ? []
        : held === "" || !field.required
          ? [""]
          : [];

    if (held === "") return [...blank, ...published];

    return [
      ...blank,
      ...(published.includes(held) ? published : [...published, held]),
    ];
  }

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
    return empty === undefined ? undefined : `Fill in ${empty.name} to save.`;
  });

  function labelFor(field: Field, value: string): string {
    if (value === "") {
      return "unset";
    }
    return (listed(field) ?? []).includes(value)
      ? labelOf(field, value)
      : `${value} — not declared`;
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
  class="mt-5 grid grid-cols-[9rem_1fr] gap-y-1.5 pt-3 max-wide:grid-cols-1"
>
  <span class="tracking-caps uppercase max-wide:mt-1.5">name</span>
  <input bind:value={name} aria-label="Name" required class={FIELD} />

  <span class="tracking-caps uppercase max-wide:mt-1.5">kind</span>
  {#if editing === undefined}
    <div class="flex flex-wrap gap-x-[2ch]">
      {#each kinds as one (one.name)}
        <Option
          label={one.name}
          chosen={chosen === one.name}
          onchoose={() => {
            chosen = one.name;
            typed = {};
          }}
        />
      {/each}
    </div>
  {:else}
    <!-- Changing it would make one destination two, and a record cannot tell
         which it meant. -->
    <span>{editing.kind}</span>
  {/if}

  <!-- The kind's own names, so the label read is the label an error will name. -->
  {#each fields as field (field.name)}
    <span class="tracking-caps uppercase max-wide:mt-1.5">
      {field.name}{field.required ? "" : " (optional)"}
    </span>
    <div>
      {#if listed(field) !== undefined}
        <div class="flex flex-wrap gap-x-[2ch]">
          {#each offered(field) as one (one)}
            <!-- Unset, the kind's default is drawn as picked, and stays unset until another is. -->
            <Option
              label={labelFor(field, one)}
              chosen={(typed[field.name] ?? "") === one ||
                ((typed[field.name] ?? "") === "" && field.preset === one)}
              onchoose={() => {
                if ((typed[field.name] ?? "") === "" && field.preset === one)
                  return;
                typed[field.name] = one;
              }}
            />
          {/each}
        </div>
      {:else}
        <input
          bind:value={typed[field.name]}
          aria-label={field.name}
          placeholder={field.placeholder}
          class={FIELD}
        />
      {/if}
    </div>
  {/each}

  {#if unfamiliarRoot}
    <p role="status" class="col-start-2 max-wide:col-start-1">
      notemap has not used {typedRoot} before — check it names the right place.
    </p>
  {/if}

  {#if missing !== undefined && !disabled}
    <p class="col-span-2 text-small text-muted max-wide:col-span-1">
      {missing}
    </p>
  {/if}
  <div
    class="col-span-2 mt-3.5 flex items-center justify-between border-t border-rule pt-2.5 max-wide:col-span-1"
  >
    <Action onclick={done}>cancel</Action>
    <span class="inverted">
      <Action submit disabled={busy || disabled || missing !== undefined}>
        {unfamiliarRoot ? "use it anyway" : "Save"}
      </Action>
    </span>
  </div>

  {#if said !== ""}
    <p role="status" class="col-span-2 text-danger max-wide:col-span-1">
      {said}
    </p>
  {/if}
</form>
