<script lang="ts">
  import type { CandidateEntry } from "@notemap/client";

  import Walked from "$components/primitives/composer/Walked.svelte";
  import { completed, narrowed } from "$lib/candidate-list";

  /**
   * A chooser over known names with free entry. What the item carries is a row
   * of pressed words, each taken off by pressing it. `+` opens a line with the
   * pool's offer beneath it, narrowed as the line is typed into: `⇥` completes
   * what was typed and walks the offer once there is nothing left to complete,
   * `↑↓` walk it, `⏎` takes the one walked to or what was typed, and `esc` or
   * leaving the line puts it away and takes nothing — a name half-typed is not
   * a decision.
   */
  let {
    names,
    offered = [],
    fires,
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
    /** Whether the `+` is drawn. A row offers it only while it is selected. */
    addable?: boolean;
    onadd: (name: string) => void;
    onremove: (name: string) => void;
  } = $props();

  const id = $props.id();

  let adding = $state(false);

  /** Opens the line, for a key that asks for it from outside. */
  export function add(): void {
    adding = true;
  }
  let draft = $state("");
  /** Where `↑↓` stands, and whether it has been used since the offer last changed. */
  let at = $state(0);
  let moved = $state(false);

  const entries = $derived<readonly CandidateEntry[]>(
    offered
      .filter((name) => !names.includes(name))
      .map((name) => ({ label: name, value: name })),
  );

  const shown = $derived(narrowed(entries, draft));

  $effect(() => {
    // Whatever the walk was on stops meaning anything once the offer beneath
    // it has changed.
    void shown;
    at = 0;
    moved = false;
  });

  const active = $derived(
    moved && shown[at] !== undefined ? `${id}-tag-${at}` : undefined,
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

  function close(): void {
    adding = false;
    draft = "";
  }

  function walk(step: 1 | -1): void {
    if (shown.length === 0) return;
    at = moved
      ? (at + step + shown.length) % shown.length
      : step === 1
        ? 0
        : shown.length - 1;
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
      const picked = shown[at];
      if (moved && picked !== undefined) take(picked.label);
      else take(draft.trim());
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
  <button
    type="button"
    aria-pressed="true"
    onclick={() => onremove(name)}
    aria-label={fired === undefined ? undefined : `${name}, routes to ${fired}`}
    class="hover:underline {fired === undefined ? '' : TRIGGER}"
  >
    {fired === undefined ? name : trigger(name)}
  </button>
{/each}

{#if adding}
  <div>
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
      aria-expanded={shown.length > 0}
      aria-controls="{id}-tags"
      aria-activedescendant={active}
      class="w-32 border-b border-ink px-2 py-0.5 outline-none"
    />
    {#if shown.length > 0}
      <!-- In flow rather than floated: the process surface scrolls its
           middle, and a panel floated past its edge is a panel scrolled out
           of reach. Rows taken on `mousedown` with the default prevented, so
           taking one never blurs the line out from under the click. -->
      <div
        id="{id}-tags"
        role="listbox"
        aria-label="Tags in use"
        class="mt-1 max-h-64 w-max min-w-36 overflow-y-auto border border-ink bg-ground px-2.5 py-1"
      >
        {#each shown as entry, index (entry.label)}
          {@const on = moved && at === index}
          {@const fired = fires?.(entry.label)}
          <Walked
            id={on ? `${id}-tag-${index}` : undefined}
            {on}
            ontake={() => take(entry.label)}
          >
            <span class={fired === undefined ? "" : TRIGGER}>{entry.label}</span
            >{#if fired !== undefined}<span>&nbsp;· {fired}</span>{/if}
          </Walked>
        {/each}
      </div>
    {/if}
  </div>
{:else if addable}
  <button
    type="button"
    aria-label="Add a tag"
    onclick={() => (adding = true)}
    class="hover:underline">+</button
  >
{/if}
