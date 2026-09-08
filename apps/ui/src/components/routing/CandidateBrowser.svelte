<script lang="ts">
  import {
    saidBy,
    type CandidateEntry,
    type DestinationCandidates,
  } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { completed, narrowed } from "$lib/candidate-list";

  /**
   * The schema-driven control: one line holding the field, with what the
   * destination offers drawn beneath it and narrowed as it is typed into. The
   * line is the value — there is no second control holding the same string, and
   * a place the destination has never heard of is typed rather than browsed to.
   *
   * The same shape the typed line has, without the hierarchy: `⇥` completes,
   * `↑↓` walks, `⏎` takes the one walked to or commits. What it keeps that the
   * line has no use for is **descent** — an entry may be somewhere to look
   * further, and this is the only control that can go there.
   */
  let {
    destination,
    capability,
    field,
    label,
    value,
    onchange,
    onsubmit,
    onrelease,
  }: {
    destination: string;
    capability: string;
    field: string;
    label: string;
    /** What the field already holds, which is also what narrows the list. */
    value: string;
    onchange: (value: string) => void;
    onsubmit?: () => void;
    /** Backspacing out of an empty line: a wrong destination is not a reason to close. */
    onrelease?: () => void;
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
  let input = $state<HTMLInputElement | undefined>(undefined);

  /** Where `↑↓` stands, and whether it has been used since the list last changed. */
  let at = $state(0);
  let moved = $state(false);

  const scope = $derived(history.at(-1)?.scope);
  const here = $derived(history.at(-1));

  /** What is drawn, and what the keyboard walks: one list, narrowed by the line. */
  const shown = $derived(narrowed(entries, value));

  // The place is what a composer with a destination in its chrome is for, so
  // the caret is here rather than waiting to be clicked into.
  $effect(() => input?.focus());

  $effect(() => {
    // Whatever the caret was on stops meaning anything once the list beneath it
    // has changed.
    void shown;
    at = 0;
    moved = false;
  });

  // Every answer but the newest is dropped: descending and coming straight
  // back leaves two asks in flight, and without this the slower one paints
  // its entries under the crumb trail of the scope already left.
  let asking = 0;

  $effect(() => {
    const at_ = scope;
    const mine = (asking += 1);
    loading = true;
    refusal = undefined;

    void (async () => {
      try {
        const answer = await client.destinations.candidates(destination, {
          capability,
          field,
          ...(at_ === undefined ? {} : { scope: at_ }),
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
      input?.focus();
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
    input?.focus();
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

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Tab" && !event.shiftKey) {
      // With nothing to complete it does nothing, rather than handing focus to
      // whatever is next: the line is what the composer is for, and leaving it
      // is `⇧⇥` or the pointer.
      event.preventDefault();
      const finished = completed(entries, value);
      if (finished !== undefined) onchange(finished);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (shown.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : shown.length - 1;
      at = moved
        ? (at + step) % shown.length
        : event.key === "ArrowDown"
          ? 0
          : shown.length - 1;
      moved = true;
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const picked = shown[at];
      // `↑↓` having moved is what makes `⏎` mean *take this one*; left alone it
      // means *route*, which is the ordinary way through the line.
      if (moved && picked !== undefined) open(picked);
      else onsubmit?.();
      return;
    }

    if (event.key === "Backspace" && value === "") {
      event.preventDefault();
      onrelease?.();
    }
  }

  const active = $derived(
    moved && shown[at] !== undefined ? `candidate-${at}` : undefined,
  );
</script>

<div class="font-mono">
  <!-- A typed field is a ground and never a rule, so the only rule in the
       modal is the chrome's. -->
  <div class="px-2 py-0.5 field">
    <input
      bind:this={input}
      {value}
      oninput={(event) => onchange(event.currentTarget.value)}
      {onkeydown}
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      aria-label={label}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={shown.length > 0}
      aria-controls="candidate-entries"
      aria-activedescendant={active}
      class="w-full bg-transparent caret-ink outline-none"
    />
  </div>

  {#if here !== undefined}
    <div class="mt-2.5 flex items-baseline gap-3">
      <Action onclick={back}>back</Action>
      {#if here.value !== undefined}
        <Action onclick={take}>use {here.label}</Action>
      {/if}
    </div>
  {:else if value !== ""}
    <div class="mt-2.5 flex items-baseline gap-3">
      <Action onclick={clear}>clear</Action>
    </div>
  {/if}

  <!-- A floor, so a short answer leaves room rather than collapsing the column
       and moving everything the eye is on. -->
  <div
    id="candidate-entries"
    role="listbox"
    aria-label="{label} candidates"
    class="mt-2.5 min-h-[var(--spacing-tree)]"
  >
    {#if loading}
      <p class="text-ink-muted">asking…</p>
    {:else if refusal !== undefined}
      <p class="text-ink-muted">{refusal}</p>
    {:else}
      {#each shown as entry, index (entry.scope ?? String(entry.value))}
        {@const picked = moved && at === index}
        <div
          id={picked ? `candidate-${index}` : undefined}
          role="option"
          tabindex="-1"
          aria-selected={picked}
          class="cursor-default {entry.value !== undefined &&
          String(entry.value) === value
            ? 'text-accent'
            : picked
              ? 'text-ink'
              : 'text-ink-muted'} {picked ? 'inverted' : ''}"
          onmousedown={(event) => {
            event.preventDefault();
            open(entry);
          }}
        >
          {entry.scope !== undefined ? `${entry.label}/` : entry.label}
        </div>
      {/each}

      {#if shown.length === 0 && entries.length > 0}
        <p class="text-ink-muted">nothing here matches</p>
      {/if}
      {#if truncated}
        <p class="text-ink-muted">more than this shows</p>
      {/if}
    {/if}
  </div>
</div>
