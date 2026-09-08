<script lang="ts">
  import {
    saidBy,
    type CandidateEntry,
    type DestinationCandidates,
  } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import Option from "$components/primitives/composer/Option.svelte";
  import { client } from "$lib/client";

  /**
   * The schema-driven browser: entries at the current scope, a way back to
   * the one before it, and a way to take the scope stood in. It carries the
   * field's own free-text input rather than sitting beside one — a folder that
   * does not exist yet cannot be browsed to, and must still be typeable.
   */
  let {
    destination,
    capability,
    field,
    label,
    value,
    onchange,
    onsubmit,
  }: {
    destination: string;
    capability: string;
    field: string;
    label: string;
    /** What the field already holds, so a listed entry it names reads back as marked. */
    value: string;
    onchange: (value: string) => void;
    onsubmit?: () => void;
  } = $props();

  type Crumb = {
    readonly label: string;
    readonly scope: string;
    /** Absent where the scope stood in is not itself something the field may hold. */
    readonly value?: string;
  };

  let history = $state<Crumb[]>([]);
  let entries = $state<readonly CandidateEntry[]>([]);
  let truncated = $state(false);
  let loading = $state(false);
  let refusal = $state<string | undefined>(undefined);

  const scope = $derived(history.at(-1)?.scope);
  const here = $derived(history.at(-1));

  // Every answer but the newest is dropped: descending and coming straight
  // back leaves two asks in flight, and without this the slower one paints
  // its entries under the crumb trail of the scope already left.
  let asking = 0;

  $effect(() => {
    const at = scope;
    const mine = (asking += 1);
    loading = true;
    refusal = undefined;

    void (async () => {
      try {
        const answer = await client.destinations.candidates(destination, {
          capability,
          field,
          ...(at === undefined ? {} : { scope: at }),
        });
        if (mine === asking) applied(answer);
      } catch (error) {
        if (mine !== asking) return;
        entries = [];
        truncated = false;
        refusal = saidBy(error);
      } finally {
        if (mine === asking) loading = false;
      }
    })();
  });

  function applied(answer: DestinationCandidates): void {
    if (answer.kind === "answered") {
      entries = answer.entries;
      truncated = answer.truncated;
      refusal = undefined;
      return;
    }

    entries = [];
    truncated = false;
    refusal =
      answer.kind === "not-offered" ? "cannot be browsed here" : answer.detail;
  }

  /**
   * An entry may be somewhere to look, something to take, or both, and the
   * three are drawn the same way: opening descends where there is anywhere to
   * descend to, and takes the value otherwise.
   */
  function open(entry: CandidateEntry): void {
    if (entry.scope === undefined) {
      if (entry.value !== undefined) onchange(String(entry.value));
      return;
    }
    history = [
      ...history,
      {
        label: entry.label,
        scope: entry.scope,
        ...(entry.value === undefined ? {} : { value: String(entry.value) }),
      },
    ];
  }

  function back(): void {
    history = history.slice(0, -1);
  }

  function take(): void {
    if (here?.value !== undefined) onchange(here.value);
  }

  /**
   * Emptying the field, not choosing the top: what an empty value means is
   * the schema's business — for `create` it is the vault's own root.
   * Offered only at the top, since `back` is what leaves a scope.
   */
  function clear(): void {
    onchange("");
  }
</script>

{#if here !== undefined}
  <div class="mb-1.5 flex items-baseline gap-3">
    <Action onclick={back}>back</Action>
    {#if here.value !== undefined}
      <Action onclick={take}>use {here.label}</Action>
    {/if}
  </div>
{:else if value !== ""}
  <div class="mb-1.5 flex items-baseline gap-3">
    <Action onclick={clear}>clear</Action>
  </div>
{/if}

{#if loading}
  <p class="text-ink-muted">asking…</p>
{:else if refusal !== undefined}
  <p class="text-ink-muted">{refusal}</p>
{:else}
  {#each entries as entry (entry.scope ?? String(entry.value))}
    <Option
      label={entry.label}
      chosen={entry.value !== undefined && String(entry.value) === value}
      onchoose={() => open(entry)}
    />
  {/each}
  {#if truncated}
    <p class="text-ink-muted">and more than this shows</p>
  {/if}
{/if}

<input
  {value}
  oninput={(event) => onchange(event.currentTarget.value)}
  onkeydown={(event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onsubmit?.();
  }}
  aria-label={label}
  class="mt-1.5 w-full border-b border-ink bg-transparent font-mono placeholder:text-ink-muted"
/>
