<script lang="ts">
  import type { CandidateEntry } from "@notemap/client";

  import Walked from "$components/primitives/composer/Walked.svelte";
  import { completed, narrowed } from "$lib/candidate-list";
  import { drawOut, fade, grow, pinned, slide, unfold } from "$lib/motion";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";

  /**
   * A chooser over known names with free entry. What the item carries is a row
   * of pressed words, each taken off by pressing it once to select it — bold —
   * and again on the `×` that appears beside it. `+` opens a line with the pool's offer in a
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
    waiting,
    marked,
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
    /** A tag this answers true for is not on the item yet, and is drawn grey until it is. */
    waiting?: (name: string) => boolean;
    /** A carried tag this answers true for is underlined: the surface is filtered by it. */
    marked?: (name: string) => boolean;
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

  type Row = {
    readonly label: string;
    readonly fresh?: boolean;
    /** The first trigger tag of an empty line's offer, ruled off from the rest. */
    readonly apart?: boolean;
  };

  /**
   * While the line is empty, a handful of the most used, then every trigger
   * tag apart beneath them; typed into, every match in the order it matched,
   * plus a last row for a name no offer holds — how a fresh tag is created. It
   * is the only row, and so the one marked, exactly where nothing matched at
   * all.
   */
  const rows = $derived.by((): readonly Row[] => {
    const typed = draft.trim();
    if (typed === "") {
      const firing = (entry: CandidateEntry) =>
        fires?.(entry.label) !== undefined;
      const ordinary = matched.filter((entry) => !firing(entry));
      const triggers = matched.filter(firing);
      return [
        ...ordinary.slice(0, SHOWN).map((entry) => ({ label: entry.label })),
        ...triggers.map((entry, at) => ({
          label: entry.label,
          apart: at === 0 && ordinary.length > 0,
        })),
      ];
    }

    const base: Row[] = matched.map((entry) => ({ label: entry.label }));

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

  /** Names the line's place for the offer to hang from, one per set on the page. */
  const anchor = `--tags-${id.replace(/[^\w-]/g, "")}`;

  const active = $derived(
    at !== undefined && rows[at] !== undefined ? `${id}-tag-${at}` : undefined,
  );

  /** How a trigger tag is drawn, in the chooser and on the row alike. */
  const TRIGGER =
    "font-semibold [font-variant-caps:all-small-caps] tracking-[0.04em]";

  const WAITING = "files the item once the edit is saved";

  function trigger(name: string): string {
    return name.startsWith(TRIGGER_NAMESPACE)
      ? name.slice(TRIGGER_NAMESPACE.length)
      : name;
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

<!-- A carried tag is marked `#`, which is how it reads as a tag beside prose
     in the same face and size; the mark is not part of its name. Bold when
     selected, holding its width so nothing beside it moves. -->
{#snippet said(word: string)}
  <span class="steady-weight" data-word={`#${word}`}
    ><span><span aria-hidden="true">#</span><span>{word}</span></span></span
  >
{/snippet}

<!-- A carried trigger tag is drawn as the name after `route/`, in small caps:
     the style says which words file, and the namespace is not a decision. The
     offer below keeps the whole name, being what is typed against. -->
{#each names as name (name)}
  {@const fired = fires?.(name)}
  {@const inert = held?.(name) === true}
  {@const filtered = marked?.(name) === true}
  {@const pending = waiting?.(name) === true}
  <span
    class="whitespace-nowrap"
    data-marked={filtered ? "" : undefined}
    transition:unfold={{ fade: true }}
  >
    {#if inert}
      <span
        title="filed the item — cancel the routing to take it off"
        aria-label={fired === undefined
          ? undefined
          : `${name}, routes to ${fired}`}
        class="px-tag {fired === undefined ? '' : TRIGGER} {filtered
          ? 'underline'
          : ''}"
      >
        {@render said(fired === undefined ? name : trigger(name))}
      </span>
    {:else}
      <!-- Room on both sides, always: selected, the word steps left by one
           side's room and the `×` takes the two, so nothing beside it moves. -->
      <span
        class="relative inline-block px-tag"
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
          aria-label={fired === undefined && !pending
            ? undefined
            : [
                name,
                fired === undefined ? undefined : `routes to ${fired}`,
                pending ? WAITING : undefined,
              ]
                .filter((part) => part !== undefined)
                .join(", ")}
          title={pending ? WAITING : undefined}
          class="transition-transform duration-(--duration-short) ease-(--ease-motion) {chosen ===
          name
            ? '-translate-x-(--spacing-tag) font-semibold'
            : 'hover:underline'} {fired === undefined ? '' : TRIGGER} {filtered
            ? 'underline'
            : ''} {pending ? 'text-inert' : ''}"
        >
          {@render said(fired === undefined ? name : trigger(name))}
        </button>{#if chosen === name}<button
            type="button"
            aria-label={`remove ${name}`}
            onclick={() => {
              chosen = undefined;
              onremove(name);
            }}
            class="absolute right-0 hover:underline"
            transition:fade
          >
            ×
          </button>{/if}
      </span>
    {/if}
  </span>
{/each}

<!-- The line's place, held whether or not it is open: at least the room the
     line opens at, so the `+` wraps where the line would and opening it moves
     nothing. Open, the line takes what is left of its row. The offer hangs
     from the place rather than the line, which is gone before the offer has
     finished closing. -->
<span
  class="h-(--text-shell--line-height) min-w-tag-line flex-1 self-start pl-tag"
>
  <span class="block h-full" style="anchor-name: {anchor}">
    {#if adding}
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
        in:drawOut
      />
    {:else}
      <!-- Drawn only where it can be taken: selecting a row then moves nothing
         under it. -->
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
  </span>
</span>

{#if adding && rows.length > 0}
  <!-- Rows taken on `mousedown` with the default prevented, so taking one
       never blurs the line out from under the click. -->
  <!-- Hung from the line where the browser can tie it there, and from the
       start of the set's own row where it cannot; the set's container is
       what it is placed against, so callers make that container relative.
       Outside the line's own block, so the line goes the moment it closes
       while the offer slides shut where it stood. -->
  <div
    class="offer z-30"
    style="position-anchor: {anchor}"
    in:slide|global={{ magnitude: "short" }}
    out:pinned|global={{ magnitude: "short" }}
  >
    <div
      bind:this={panel}
      id="{id}-tags"
      role="listbox"
      aria-label="Tags in use"
      class="mt-1 max-h-64 w-max min-w-36 overflow-y-auto border border-ink bg-ground px-2.5 py-1"
    >
      {#each rows as row, index (row.fresh ? `fresh:${row.label}` : row.label)}
        {@const on = at === index}
        {@const fired = row.fresh ? undefined : fires?.(row.label)}
        {#if row.apart}
          <div
            aria-hidden="true"
            class="-mx-2.5 my-1 border-t border-ink"
          ></div>
        {/if}
        <Walked
          id={on ? `${id}-tag-${index}` : undefined}
          {on}
          onhover={() => (at = index)}
          ontake={() => take(row.label)}
        >
          {#if row.fresh}
            + {row.label}
          {:else}
            <span class={fired === undefined ? "" : TRIGGER}>{row.label}</span
            >{#if fired !== undefined}<span>&nbsp;→ {fired}</span>{/if}
          {/if}
        </Walked>
      {/each}
    </div>
  </div>
{/if}
