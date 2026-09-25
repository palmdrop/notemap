<script lang="ts">
  import type { CandidateEntry } from "@notemap/client";

  import Walked from "$components/primitives/composer/Walked.svelte";
  import { completed, narrowed } from "$lib/candidate-list";
  import { grow, slide, unfold, widen } from "$lib/motion";

  /**
   * A chooser over known names with free entry. What the item carries is a row
   * of pressed words, each taken off by pressing it once to select it — ruled
   * round — and again on the `×` that appears inside the rule. `+` opens a line with the pool's offer in a
   * panel beneath it, narrowed as the line is typed into: the first match is
   * marked as soon as the line is typed into, `⇥` completes what was typed as
   * far as the offer agrees and once there is nothing left to complete walks
   * the offer, `↑↓` and the pointer walk it too, `⏎` takes the marked row, and
   * `esc` or leaving the line puts it away and takes nothing — a name
   * half-typed is not a decision.
   */
  let {
    names,
    offered = [],
    fires,
    held,
    addable = true,
    label = "Add a tag",
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
    /** What the `+` and the line are called, where two sets share a page. */
    label?: string;
    onadd: (name: string) => void;
    onremove: (name: string) => void;
  } = $props();

  const id = $props.id();

  /** How many the panel offers while the line is empty; typing narrows the whole list. */
  const SHOWN = 8;

  let adding = $state(false);
  let draft = $state("");
  /** Where the walk stands, and the row that is marked. Nothing, until the line is typed into or walked. */
  let at = $state<number | undefined>(undefined);
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

  // The row is the only caller that toggles this, and a `×` left on a row
  // nobody is on is a control nobody asked for.
  $effect(() => {
    if (!addable) chosen = undefined;
  });

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

    const known = [...entries.map((entry) => entry.label), ...names].some(
      (name) => name.toLowerCase() === typed.toLowerCase(),
    );
    return known ? base : [...base, { label: typed, fresh: true }];
  });

  $effect(() => {
    // Whatever the walk was on stops meaning anything once the offer beneath
    // it has changed. A line with nothing typed marks nothing: a reflex `⏎`
    // after `+` must not classify the item with whatever is most used.
    void rows;
    at = draft.trim() === "" ? undefined : 0;
  });

  let panel = $state<HTMLElement | null>(null);
  let tall: number | undefined;

  // The offer narrows at typing speed; each change turns the panel toward its
  // new height from wherever it stands, and never holds a key back.
  $effect.pre(() => {
    void rows;
    tall = panel?.getBoundingClientRect().height;
  });

  $effect(() => {
    void rows;
    if (panel !== null && tall !== undefined) grow(panel, tall);
  });

  const active = $derived(
    at !== undefined && rows[at] !== undefined ? `${id}-tag-${at}` : undefined,
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
    at =
      at === undefined
        ? step === 1
          ? 0
          : rows.length - 1
        : (at + step + rows.length) % rows.length;
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Tab" && !event.shiftKey) {
      // The line is what the control is for, so the key never leaves it.
      event.preventDefault();

      const finished = completed(entries, draft, "label");
      if (finished !== undefined) {
        draft = finished;
        return;
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
      const picked = at === undefined ? undefined : rows[at];
      if (picked === undefined) close();
      else take(picked.label);
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
  <span class="whitespace-nowrap" transition:unfold={{ fade: true }}>
    {#if inert}
      <span
        title="filed the item — cancel the routing to take it off"
        aria-label={fired === undefined
          ? undefined
          : `${name}, routes to ${fired}`}
        class={fired === undefined ? "" : TRIGGER}
      >
        {fired === undefined ? name : trigger(name)}
      </span>
    {:else}
      <span
        class="-mx-0.75 inline-block px-0.75 leading-(--text-shell--line-height) outline-1 outline-transparent transition-[outline-color] duration-(--duration-short) ease-fade data-chosen:outline-ink"
        data-chosen={chosen === name ? "" : undefined}
      >
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
          class="{chosen === name ? '' : 'hover:underline'} {fired === undefined
            ? ''
            : TRIGGER}"
        >
          {fired === undefined ? name : trigger(name)}
        </button>{#if chosen === name}<button
            type="button"
            aria-label={`remove ${name}`}
            onclick={() => {
              chosen = undefined;
              onremove(name);
            }}
            class="ml-1 hover:underline"
            transition:slide={{ axis: "x", magnitude: "short" }}
          >
            ×
          </button>{/if}
      </span>
    {/if}
  </span>
{/each}

{#if adding}
  <div
    class="relative h-(--text-shell--line-height) min-w-[3ch] flex-1 self-start"
    transition:widen={{ magnitude: "short" }}
  >
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={draft}
      autofocus
      onblur={close}
      {onkeydown}
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      aria-label={label}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={rows.length > 0}
      aria-controls="{id}-tags"
      aria-activedescendant={active}
      class="h-full w-full border-b border-ink px-1 outline-none"
    />
    {#if rows.length > 0}
      <!-- Rows taken on `mousedown` with the default prevented, so taking one
           never blurs the line out from under the click. -->
      <div
        class="absolute top-full left-0 z-30 mt-1"
        transition:slide|global={{ magnitude: "short" }}
      >
        <div
          bind:this={panel}
          id="{id}-tags"
          role="listbox"
          aria-label="Tags in use"
          class="max-h-64 w-max min-w-36 overflow-y-auto border border-ink bg-ground px-2.5 py-1"
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
                <span class={fired === undefined ? "" : TRIGGER}
                  >{row.label}</span
                >{#if fired !== undefined}<span>&nbsp;· {fired}</span>{/if}
              {/if}
            </Walked>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{:else}
  <!-- Held in place on every row, drawn only where it can be taken: selecting
       a row, and opening the line, then move nothing under it. -->
  <button
    type="button"
    aria-label={addable ? label : undefined}
    aria-hidden={!addable || undefined}
    tabindex={addable ? undefined : -1}
    disabled={!addable}
    onclick={open}
    class="hover:underline {addable ? '' : 'invisible'}">+</button
  >
{/if}
