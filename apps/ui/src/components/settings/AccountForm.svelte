<script lang="ts">
  import { untrack } from "svelte";

  import { saidBy, type Account, type AccountKind } from "@notemap/client";

  import Option from "$components/primitives/composer/Option.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { fieldsOf, typedFrom, valuesFrom } from "$lib/schema-form";

  let {
    kinds,
    editing,
    disabled,
    done,
  }: {
    kinds: readonly AccountKind[];
    /** A config account is edited by storing a copy, which from then on is the one used. */
    editing?: Account;
    disabled: boolean;
    done: () => void;
  } = $props();

  const FIELD =
    "w-full border-b border-ink bg-transparent px-0 py-0.5 outline-none";

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

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (chosen === undefined) return;

    busy = true;
    said = "";
    try {
      await client.accounts.put(chosen, name.trim(), {
        fields: valuesFrom(fields, typed),
        ...(secret === "" ? {} : { secret }),
      });
      secret = "";
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
  class="mt-5 grid grid-cols-[9rem_1fr] gap-y-1.5 pt-3 max-narrow:grid-cols-1"
>
  <span class="tracking-caps uppercase max-narrow:mt-1.5">name</span>
  {#if editing === undefined}
    <input bind:value={name} aria-label="Name" required class={FIELD} />
  {:else}
    <!-- A destination names an account by this, so changing it is a new account. -->
    <span>{editing.name}</span>
  {/if}

  <span class="tracking-caps uppercase max-narrow:mt-1.5">kind</span>
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
    <span>{editing.kind}</span>
  {/if}

  {#each fields as field (field.name)}
    <span class="tracking-caps uppercase max-narrow:mt-1.5">
      {field.name}{field.required ? "" : " (optional)"}
    </span>
    <input
      bind:value={typed[field.name]}
      aria-label={field.name}
      class={FIELD}
    />
  {/each}

  <span class="tracking-caps uppercase max-narrow:mt-1.5">secret</span>
  <input
    type="password"
    autocomplete="new-password"
    bind:value={secret}
    aria-label="Secret"
    required={!keeping}
    placeholder={keeping ? "set — leave blank to keep it" : ""}
    class={FIELD}
  />

  {#if editing?.from === "config"}
    <p role="status" class="col-span-2 mt-2 max-narrow:col-span-1">
      Saving stores this account in the daemon. From then on the entry in the
      config file is ignored.
    </p>
  {/if}

  <div
    class="col-span-2 mt-3.5 flex items-center justify-between border-t border-ink pt-2.5 max-narrow:col-span-1"
  >
    <Action onclick={done}>cancel</Action>
    <span class="inverted">
      <Action submit disabled={busy || disabled}>
        {editing === undefined ? "create" : "save"}
      </Action>
    </span>
  </div>

  {#if said !== ""}
    <p role="status" class="col-span-2 text-alarm max-narrow:col-span-1">
      {said}
    </p>
  {/if}
</form>
