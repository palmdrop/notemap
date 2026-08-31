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
   * the one before it, and a way to take the scope stood in. Placed beside
   * the field's own free-text input rather than instead of it — a folder
   * that does not exist yet cannot be browsed to.
   */
  let {
    destination,
    capability,
    field,
    value,
    onchoose,
  }: {
    destination: string;
    capability: string;
    field: string;
    /** What the field already holds, so a listed entry it names reads back as marked. */
    value: string;
    onchoose: (value: string) => void;
  } = $props();

  type Crumb = {
    readonly label: string;
    readonly scope: string;
    readonly value: string;
  };

  let history = $state<Crumb[]>([]);
  let entries = $state<readonly CandidateEntry[]>([]);
  let truncated = $state(false);
  let loading = $state(false);
  let refusal = $state<string | undefined>(undefined);

  const scope = $derived(history.at(-1)?.scope);

  $effect(() => {
    const at = scope;
    loading = true;
    refusal = undefined;

    void (async () => {
      try {
        const answer = await client.destinations.candidates(destination, {
          capability,
          field,
          ...(at === undefined ? {} : { scope: at }),
        });
        applied(answer);
      } catch (error) {
        entries = [];
        truncated = false;
        refusal = saidBy(error);
      } finally {
        loading = false;
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

  /** A walkable entry descends; one with nothing past it is taken directly. */
  function open(entry: CandidateEntry): void {
    if (entry.scope === undefined) {
      onchoose(String(entry.value));
      return;
    }
    history = [
      ...history,
      { label: entry.label, scope: entry.scope, value: String(entry.value) },
    ];
  }

  function back(): void {
    history = history.slice(0, -1);
  }

  function take(): void {
    const here = history.at(-1);
    if (here !== undefined) onchoose(here.value);
  }
</script>

{#if history.length > 0}
  <div class="mb-1.5 flex items-baseline gap-3">
    <Action onclick={back}>back</Action>
    <Action onclick={take}>use {history.at(-1)?.label}</Action>
  </div>
{/if}

{#if loading}
  <p class="text-ink-muted">asking…</p>
{:else if refusal !== undefined}
  <p class="text-ink-muted">{refusal}</p>
{:else}
  {#each entries as entry (entry.label)}
    <Option
      label={entry.label}
      chosen={String(entry.value) === value}
      onchoose={() => open(entry)}
    />
  {/each}
  {#if truncated}
    <p class="text-ink-muted">and more than this shows</p>
  {/if}
{/if}
