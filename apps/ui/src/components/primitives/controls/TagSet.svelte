<script lang="ts">
  import type { CandidateEntry } from "@notemap/client";

  import Walked from "$components/primitives/composer/Walked.svelte";
  import { completed, narrowed } from "$lib/candidate-list";

  /**
   * A chooser over known names with free entry. What the item carries is a row
   * of pressed words, each taken off by pressing it once to select it and
   * again on the `×` that appears. `+` opens a line with the pool's offer in a
   * panel beneath it, narrowed as the line is typed into: the first row is
   * always marked, `⇥` completes what was typed as far as the offer agrees
   * and once there is nothing left to complete walks the offer, `↑↓` and the
   * pointer walk it too, `⏎` takes the marked row, and `esc` or leaving the
   * line puts it away and takes nothing — a name half-typed is not a
   * decision.
   */
  let {
    names,
    offered = [],
    fires,
    held,
    addable = true,
    onadd,
    onremove,
  }: {
    names: readonly string[];
    /** What the pool already carries, most used first. Completion, never a limit. */
    offered?: readonly string[];
    /**
     * The template this tag applies, where it applies one. A tag that files the
     * item somewhere is not an ordinary one, and offering it unmarked is how
     * somebody takes one by accident.
     */
    fires?: (name: string) => string | undefined;
    /**
     * A carried tag this answers true for filed the item, and what it filed
     * still stands: it is drawn inert rather than as a control, and the way
     * off is cancelling the routing rather than pressing the tag.
     */
    held?: (name: string) => boolean;
    /** Whether the `+` is drawn. A row offers it only while it is selected. */
    addable?: boolean;
    onadd: (name: string) => void;
    onremove: (name: string) => void;
  } = $props();

  const id = $props.id();

  /** How many the panel offers while the line is empty; typing narrows the whole list. */
  const SHOWN = 8;

  let adding = $state(false);
  let draft = $state("");
  /** Where the walk stands. The row at this index is always marked while the panel is drawn. */
  let at = $state(0);
  /** Whether `↑↓`/`⇥` have walked since the offer last changed, for `⇥`'s own step. */
  let moved = $state(false);
  /** A carried tag pressed to select it, so its `×` is drawn. */
  let chosen = $state<string | undefined>(undefined);

  /** Opens the line, for a key that asks for it from outside. */
  export function add(): void {
    open();
  }

  function open(): void {
    adding = true;
    chosen = undefined;
  }

  function close(): void {
    adding = false;
    draft = "";
  }

  const entries = $derived<readonly CandidateEntry[]>(
    offered
      .filter((name) => !names.includes(name))
      .map((name) => ({ label: name, value: name })),
  );

  const matched = $derived(narrowed(entries, draft));
  const shown = $derived(
    draft.trim() === "" ? matched.slice(0, SHOWN) : matched,
  );

  type Row = { readonly label: string; readonly fresh?: boolean };

  /**
   * `shown`, plus a last row for a name no offer holds — how a fresh tag is
   * created. It is the only row, and so the one marked, exactly where nothing
   * matched at all.
   */
  const rows = $derived.by((): readonly Row[] => {
    const typed = draft.trim();
    const base: Row[] = shown.map((entry) => ({ label: entry.label }));
    if (typed === "") return base;

    const known = entries.some(
      (entry) => entry.label.toLowerCase() === typed.toLowerCase(),
    );
    return known ? base : [...base, { label: typed, fresh: true }];
  });

  $effect(() => {
    // Whatever the walk was on stops meaning anything once the offer beneath
    // it has changed.
    void rows;
    at = 0;
    moved = false;
  });

  const active = $derived(
    rows[at] !== undefined ? `${id}-tag-${at}` : undefined,
  );

  /** How a trigger tag is drawn, in the chooser and on the row alike. */
  const TRIGGER =
    "font-semibold [font-variant-caps:all-small-caps] tracking-[0.04em]";

  const NAMESPACE = "route/";

  function trigger(name: string): string {
    return name.startsWith(NAMESPACE) ? name.slice(NAMESPACE.length) : name;
  }

  function take(name: string): void {
    close();
    if (name !== "" && !names.includes(name)) onadd(name);
  }

  /** Pressing a carried tag selects it, or clears the selection where it already was. */
  function press(name: string): void {
    chosen = chosen === name ? undefined : name;
  }

  function walk(step: 1 | -1): void {
    if (rows.length === 0) return;
    at = moved
      ? (at + step + rows.length) % rows.length
      : step === 1
        ? 0
        : rows.length - 1;
    moved = true;
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Tab" && !event.shiftKey) {
      // The line is what the control is for, so the key never leaves it.
      event.preventDefault();

      // Completion is for a line still being typed. Once the walk has
      // started the line is a filter, and completing it again would put the
      // shared prefix back and walk the same two names forever.
      if (!moved) {
        const finished = completed(entries, draft, "label");
        if (finished !== undefined) {
          draft = finished;
          return;
        }
      }
      walk(1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      walk(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const picked = rows[at];
      if (picked !== undefined) take(picked.label);
      return;
    }

    if (event.key === "Escape") {
      // Putting this away is what the key did here, so nothing above it — a
      // composer stepping back, a row closing — also acts on the one press.
      event.stopPropagation();
      close();
    }
  }
</script>

<!-- A carried trigger tag is drawn as the name after `route/`, in small caps:
     the style says which words file, and the namespace is not a decision. The
     offer below keeps the whole name, being what is typed against. -->
{#each names as name (name)}
  {@const fired = fires?.(name)}
  {@const inert = held?.(name) === true}
  {#if inert}
    <span
      title="filed the item — cancel the routing to take it off"
      class={fired === undefined ? "" : TRIGGER}
    >
      {fired === undefined ? name : trigger(name)}
    </span>
  {:else}
    <button
      type="button"
      aria-pressed="true"
      onclick={() => press(name)}
      onkeydown={(event) => {
        if (event.key === "Escape" && chosen === name) {
          event.stopPropagation();
          chosen = undefined;
        }
      }}
      aria-label={fired === undefined
        ? undefined
        : `${name}, routes to ${fired}`}
      class="hover:underline {fired === undefined ? '' : TRIGGER}"
    >
      {fired === undefined ? name : trigger(name)}
    </button>
    {#if chosen === name}
      <button
        type="button"
        aria-label={`remove ${name}`}
        onclick={() => {
          chosen = undefined;
          onremove(name);
        }}
        class="hover:underline"
      >
        ×
      </button>
    {/if}
  {/if}
{/each}

{#if adding}
  <div class="relative">
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={draft}
      autofocus
      onblur={close}
      {onkeydown}
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      aria-label="Add a tag"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={rows.length > 0}
      aria-controls="{id}-tags"
      aria-activedescendant={active}
      class="w-32 border-b border-ink px-2 py-0.5 outline-none"
    />
    {#if rows.length > 0}
      <!-- Absolute rather than in flow: a panel this size still extends the
           process surface's scrolling middle, so it stays reachable there.
           Rows taken on `mousedown` with the default prevented, so taking one
           never blurs the line out from under the click. -->
      <div
        id="{id}-tags"
        role="listbox"
        aria-label="Tags in use"
        class="absolute top-full left-0 z-30 mt-1 max-h-64 w-max min-w-36 overflow-y-auto border border-ink bg-ground px-2.5 py-1"
      >
        {#each rows as row, index (row.fresh ? `fresh:${row.label}` : row.label)}
          {@const on = at === index}
          {@const fired = row.fresh ? undefined : fires?.(row.label)}
          <Walked
            id={on ? `${id}-tag-${index}` : undefined}
            {on}
            onhover={() => (at = index)}
            ontake={() => take(row.label)}
          >
            {#if row.fresh}
              new · {row.label}
            {:else}
              <span class={fired === undefined ? "" : TRIGGER}>{row.label}</span
              >{#if fired !== undefined}<span>&nbsp;· {fired}</span>{/if}
            {/if}
          </Walked>
        {/each}
      </div>
    {/if}
  </div>
{:else if addable}
  <button
    type="button"
    aria-label="Add a tag"
    onclick={open}
    class="hover:underline">+</button
  >
{/if}
