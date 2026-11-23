<script lang="ts">
  import Band from "$components/primitives/blocks/Band.svelte";
  import Segmented from "$components/primitives/blocks/Segmented.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import { headed } from "$lib/heading.svelte";
  import { trailTo } from "./href";

  import FormBar from "./form/FormBar.svelte";
  import Guard from "./form/Guard.svelte";
  import { untrack } from "svelte";

  import { saidBy, type Account, type AccountKind } from "@notemap/client";

  import { client } from "$lib/client";
  import { fieldsOf, typedFrom, valuesFrom } from "$lib/schema-form";

  let {
    kinds,
    editing,
    disabled,
    done,
    onremove,
  }: {
    kinds: readonly AccountKind[];
    /** A stored account can be removed, from a band of its own. */
    onremove?: () => void;
    /** A config account is edited by storing a copy, which from then on is the one used. */
    editing?: Account;
    disabled: boolean;
    done: () => void;
  } = $props();

  let name = $state(untrack(() => editing?.name ?? ""));
  let typed = $state(untrack(() => typedFrom(editing?.fields)));
  // Never filled from the daemon, which has no way to answer it.
  let secret = $state("");
  let said = $state("");
  let busy = $state(false);

  let chosen = $derived(editing?.kind ?? kinds[0]?.name);

  const fields = $derived(
    fieldsOf(kinds.find((one) => one.name === chosen)?.accountSchema),
  );

  /** Only a stored account has a secret to keep; anything else is a new record. */
  const keeping = $derived(editing?.from === "stored");

  const begun = untrack(() => JSON.stringify([name, typed]));
  let saved = false;
  const changed = (): boolean =>
    !saved && (secret !== "" || JSON.stringify([name, typed]) !== begun);

  /** Why it cannot be saved yet, said over Save. */
  const missing = $derived(
    disabled
      ? "The pool is out of reach."
      : name.trim() === ""
        ? "Name it to save."
        : chosen === undefined
          ? "Pick a kind to save."
          : !keeping && secret === ""
            ? "Give it a secret to save."
            : undefined,
  );

  headed(() => ({
    title: editing === undefined ? "new account" : "edit account",
    trail: trailTo("accounts"),
    out: { icon: "close", label: "Cancel", run: done },
    ...(editing === undefined ? {} : { under: editing.name }),
  }));

  async function submit(event?: SubmitEvent) {
    event?.preventDefault();
    if (chosen === undefined || missing !== undefined || busy) return;

    busy = true;
    said = "";
    try {
      await client.accounts.put(chosen, name.trim(), {
        fields: valuesFrom(fields, typed),
        ...(secret === "" ? {} : { secret }),
      });
      secret = "";
      saved = true;
      done();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }
</script>

<Guard about={editing?.name ?? "a new account"} {changed} />

<form onsubmit={submit}>
  <Band>account</Band>
  <label class="block border-b border-rule px-gutter py-3">
    <span class="mb-1.5 block text-small">name</span>
    {#if editing === undefined}
      <input
        bind:value={name}
        aria-label="Name"
        required
        placeholder="what destinations call it"
        class="min-h-11 w-full rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
      />
    {:else}
      <!-- A destination names an account by this, so changing it is a new account. -->
      <span class="block">{editing.name}</span>
    {/if}
  </label>

  <div class="border-b border-rule px-gutter py-3">
    <span class="mb-1.5 block text-small">kind</span>
    {#if editing === undefined}
      <Segmented
        label="kind"
        value={chosen}
        options={kinds.map((one) => ({ value: one.name, word: one.name }))}
        onchoose={(one) => {
          chosen = one;
          typed = {};
        }}
      />
    {:else}
      <span class="block">{editing.kind}</span>
    {/if}
  </div>

  {#each fields as field (field.name)}
    <label class="block border-b border-rule px-gutter py-3">
      <span class="mb-1.5 block text-small"
        >{field.name}{field.required ? "" : " (optional)"}</span
      >
      <input
        bind:value={typed[field.name]}
        aria-label={field.name}
        placeholder={field.placeholder}
        class="min-h-11 w-full rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
      />
    </label>
  {/each}

  <label class="block border-b border-rule px-gutter py-3">
    <span class="mb-1.5 block text-small">secret</span>
    <input
      type="password"
      autocomplete="new-password"
      bind:value={secret}
      aria-label="Secret"
      required={!keeping}
      placeholder={keeping ? "set — leave blank to keep it" : ""}
      class="min-h-11 w-full rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
    />
  </label>

  {#if onremove !== undefined}
    <Band>remove</Band>
    <LinkRow
      icon="trash"
      title="Remove…"
      line="A destination that names it can no longer sign in."
      danger
      chevron={false}
      {disabled}
      onclick={onremove}
    />
  {/if}

  {#if said !== ""}
    <p role="status" class="m-0 px-gutter py-3 text-danger">{said}</p>
  {/if}
</form>

<FormBar {missing} {busy} oncancel={done} onsave={() => void submit()} />
