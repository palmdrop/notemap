<script lang="ts">
  import { tick } from "svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import type { CandidateEntry } from "@notemap/client";

  import Walked from "$components/primitives/composer/Walked.svelte";
  import type { Ask, Supplied } from "$lib/asked";
  import { completed, narrowed, takenAs } from "$lib/candidate-list";
  import { width } from "$lib/breakpoint";
  import {
    drawOut,
    fade,
    fromFoot,
    grow,
    pinned,
    rise,
    slide,
    unfold,
  } from "$lib/motion";
  import { TRIGGER_NAMESPACE } from "$lib/trigger";

  /**
   * A chooser over known names with free entry. What the item carries is a row
   * of tags, each taken off by its `×` where tags can be changed. `+` opens a line with the pool's offer in a
   * panel beneath it, narrowed as the line is typed into: the first match is
   * marked as soon as the line is typed into, `⇥` completes what was typed as
   * far as the offer agrees and once there is nothing left to complete walks
   * the offer, `↑↓` and the pointer walk it too, `⏎` takes the marked row, and
   * `esc` or leaving the line puts it away and takes nothing — a name
   * half-typed is not a decision.
   *
   * A trigger tag whose template asks for something does not land when it is
   * taken: the line asks for each value in turn, the panel offering what the
   * field allows, and the tag lands with them once the last is given. `⏎` on
   * an empty line takes the default, `esc` steps back a field and then back to
   * the tags.
   */
  let {
    names,
    offered = [],
    fires,
    held,
    fixed = false,
    waiting,
    marked,
    ask,
    besides,
    partly,
    field = false,
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
    /** Every carried tag drawn as a word rather than a control: none can be taken off here. */
    fixed?: boolean;
    /** A tag this answers true for is not on the item yet, and is drawn grey until it is. */
    waiting?: (name: string) => boolean;
    /** A carried tag this answers true for is underlined: the surface is filtered by it. */
    marked?: (name: string) => boolean;
    /**
     * What taking this tag asks before it can land. Absent, at once, for a tag
     * that asks nothing, so an ordinary tag lands on the keystroke.
     */
    ask?: (name: string) => Promise<Ask | undefined> | undefined;
    /** Said after a carried tag: where the values it was given put the item. */
    besides?: (name: string) => string | undefined;
    /**
     * A tag on only some of what the set stands for, said as how many of how
     * many (`2/5`): drawn dashed, and pressing it puts it on the rest.
     */
    partly?: (name: string) => string | undefined;
    /**
     * The line drawn as a field over the tags, its offer in the flow beneath
     * it, both always there: for a set in a sheet, which clips what hangs over
     * it, and where leaving the line must not move the tags under a press.
     */
    field?: boolean;
    /** Whether the `+` is drawn. A row offers it only while it is selected. */
    addable?: boolean;
    /** What the `+` and the line are called, where two sets share a page. */
    label?: string;
    onadd: (name: string, supplied?: Supplied) => void;
    onremove: (name: string) => void;
  } = $props();

  const id = $props.id();

  /** How many the panel offers while the line is empty; typing narrows the whole list. */
  const SHOWN = 8;

  let adding = $state(false);
  let draft = $state("");
  /** Where the walk stands, and the row that is marked. Nothing, until the line is typed into or walked. */
  let at = $state<number | undefined>(undefined);
  let line = $state<HTMLInputElement | null>(null);
  // On a phone the line goes to the top of the view, so the offer has the room
  // under it down to the keyboard.
  $effect(() => {
    if (adding && !field && !width.wide) {
      line?.scrollIntoView({ block: "start" });
    }
  });

  /** Opens the line, for a key that asks for it from outside. */
  export function add(): void {
    if (field) line?.focus({ preventScroll: true });
    else open();
  }

  function open(): void {
    adding = true;
  }

  function close(): void {
    adding = false;
    draft = "";
    stepping = undefined;
  }

  /** The question put away unanswered: the tag stays off. */
  function leaveOff(): void {
    if (field) done();
    else close();
  }

  /** A tag taken: the line is put away, or as a field emptied for the next. */
  function done(): void {
    if (!field) {
      close();
      return;
    }
    const asked = stepping !== undefined;
    draft = "";
    stepping = undefined;
    if (asked) void tick().then(() => line?.focus({ preventScroll: true }));
  }

  /** A trigger tag taken, and the values it is being given before it lands. */
  type Stepping = {
    readonly tag: string;
    readonly ask: Ask;
    readonly at: number;
    readonly values: Supplied;
  };

  let stepping = $state<Stepping | undefined>(undefined);
  const stepped = $derived(stepping !== undefined);

  // Drawn without a <dialog>, so back on a phone would leave the page: the
  // close request it sends puts the question away as its × does.
  $effect(() => {
    if (!stepped || typeof CloseWatcher === "undefined") return;
    const watcher = new CloseWatcher();
    watcher.onclose = leaveOff;
    return () => watcher.destroy();
  });

  const step = $derived(
    stepping === undefined ? undefined : stepping.ask.steps[stepping.at],
  );

  /** What the destination answered for the field being asked, while it is the one asked. */
  let listed = $state<readonly CandidateEntry[]>([]);
  let listing = 0;

  $effect(() => {
    const asked = step;
    const earlier = stepping?.values ?? {};
    const mine = (listing += 1);
    listed = [];
    if (asked?.listed === undefined) return;
    void asked.listed(earlier).then(
      (entries) => {
        if (mine === listing) listed = entries;
      },
      () => {
        // A destination that cannot answer leaves the field typed.
      },
    );
  });

  const entries = $derived<readonly CandidateEntry[]>(
    offered
      .filter((name) => !names.includes(name))
      .map((name) => ({ label: name, value: name })),
  );

  const matched = $derived(narrowed(entries, draft));

  type Row = {
    readonly label: string;
    /** What taking it gives, where that is not the label: a heading's own words under its `#`s. */
    readonly value?: string;
    readonly fresh?: boolean;
    /** The first trigger tag of an empty line's offer, ruled off from the rest. */
    readonly apart?: boolean;
  };

  /** What may be given for the field being asked, narrowed as the line is typed into. */
  const offeredValues = $derived<readonly CandidateEntry[]>(
    step?.closed !== undefined
      ? step.closed.map((one) => ({ label: one, value: one }))
      : listed,
  );

  /**
   * A closed field offers only what it holds. A listed one offers what the
   * destination answered and, typed into, the typed words as a row of their
   * own, so a heading that is not there yet is taken knowingly.
   */
  function valueRows(): readonly Row[] {
    const typed = draft.trim();
    const base: Row[] = narrowed(offeredValues, draft).map((entry) => ({
      label: entry.label,
      value: takenAs(entry),
    }));
    if (typed === "" || step?.closed !== undefined) return base;
    const known = offeredValues.some((entry) =>
      [takenAs(entry), entry.label].some(
        (one) => one.toLowerCase() === typed.toLowerCase(),
      ),
    );
    return known
      ? base
      : [...base, { label: typed, value: typed, fresh: true }];
  }

  /**
   * While the line is empty, a handful of the most used, then every trigger
   * tag apart beneath them; typed into, every match in the order it matched,
   * plus a last row for a name no offer holds — how a fresh tag is created. It
   * is the only row, and so the one marked, exactly where nothing matched at
   * all.
   */
  const rows = $derived.by((): readonly Row[] => {
    if (step !== undefined) return valueRows();
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

  // A field's offer stands in the flow and changes height instead: sliding
  // out, it would keep drawing the rows it no longer has.
  const hung = (node: Element) =>
    field ? {} : slide(node, { magnitude: "short" });
  const unhung = (node: HTMLElement) =>
    field ? {} : pinned(node, { magnitude: "short" });
  const asking = (node: Element) => (width.wide ? rise(node) : fromFoot(node));

  /** Names the line's place for the offer to hang from, one per set on the page. */
  const anchor = `--tags-${id.replace(/[^\w-]/g, "")}`;

  const active = $derived(
    at !== undefined && rows[at] !== undefined ? `${id}-tag-${at}` : undefined,
  );

  /** How a trigger tag is drawn, in the chooser and on the row alike. */
  const TRIGGER = "inline-flex items-center gap-1";

  /** A tag on a row or an item: a small box of the box grey. */
  const CHIP =
    "inline-flex min-h-6 items-center rounded-tag border border-tag-line bg-tag px-1.5 text-small text-tag-ink";

  const WAITING = "files the item once the edit is saved";

  function trigger(name: string): string {
    return name.startsWith(TRIGGER_NAMESPACE)
      ? name.slice(TRIGGER_NAMESPACE.length)
      : name;
  }

  function take(name: string): void {
    if (name === "" || names.includes(name)) {
      done();
      return;
    }
    const asking = ask?.(name);
    if (asking === undefined) {
      done();
      onadd(name);
      return;
    }

    draft = "";
    void asking.then((found) => {
      if (!adding && !field) return;
      if (found === undefined || found.steps.length === 0) {
        done();
        onadd(name);
        return;
      }
      stepping = { tag: name, ask: found, at: 0, values: {} };
    });
  }

  /**
   * One field given: the next is asked, or the tag lands with them all. A
   * value left out is the default, which is the pool's to fill in.
   */
  function give(value: string | undefined): void {
    if (stepping === undefined || step === undefined) return;
    const values =
      value === undefined
        ? stepping.values
        : { ...stepping.values, [step.field]: value };

    if (stepping.at + 1 < stepping.ask.steps.length) {
      stepping = { ...stepping, at: stepping.at + 1, values };
      draft = "";
      return;
    }
    const tag = stepping.tag;
    done();
    onadd(
      tag,
      Object.keys(values).length === 0 ? undefined : $state.snapshot(values),
    );
  }

  /**
   * What `⏎` gives: the row walked to, else what was typed where the field
   * takes it, else the default where the line is empty. Nothing, where there is
   * nothing to fall back on — the line stays and asks again.
   */
  function given(): void {
    if (step === undefined) return;
    const picked = at === undefined ? undefined : rows[at];
    if (picked !== undefined) {
      give(picked.value ?? picked.label);
      return;
    }
    const typed = draft.trim();
    if (typed !== "") {
      if (step.closed === undefined || step.closed.includes(typed)) give(typed);
      return;
    }
    if (step.default !== undefined) give(undefined);
  }

  function stepBack(): void {
    if (stepping === undefined) return;
    draft = "";
    stepping =
      stepping.at === 0 ? undefined : { ...stepping, at: stepping.at - 1 };
    if (stepping === undefined) {
      void tick().then(() => line?.focus({ preventScroll: true }));
    }
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

      const finished = completed(
        step === undefined ? entries : offeredValues,
        draft,
        "label",
      );
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
      if (step !== undefined) {
        given();
        return;
      }
      const picked = at === undefined ? undefined : rows[at];
      if (picked === undefined) done();
      else take(picked.label);
      return;
    }

    if (event.key === "Escape") {
      // An empty field has nothing to put away, so the key goes on to close
      // what holds it.
      if (field && stepping === undefined && draft === "") return;
      // Putting this away is what the key did here, so nothing above it — a
      // composer stepping back, a row closing, a sheet's dialog — also acts
      // on the one press.
      event.stopPropagation();
      event.preventDefault();
      if (stepping !== undefined) stepBack();
      else done();
    }
  }
</script>

<!-- A carried tag is marked `#`, which is how it reads as a tag beside prose
     in the same face and size; the mark is not part of its name. A trigger
     tag is the route icon and the name after `route/`: the namespace is not a
     decision. -->
{#snippet said(word: string, triggered = false)}
  <span class="inline-flex items-center {triggered ? 'gap-1' : ''}"
    >{#if triggered}<Icon name="route" class="size-3.5" />{:else}<span
        aria-hidden="true">#</span
      >{/if}<span>{word}</span></span
  >
{/snippet}

{#snippet carried()}
  <!-- Where tags can be changed every one carries its ×; elsewhere they are
     words, and pressing one is pressing what it sits on. -->
  {#each names as name (name)}
    {@const fired = fires?.(name)}
    {@const filed = held?.(name) === true}
    {@const inert = fixed || filed}
    {@const filtered = marked?.(name) === true}
    {@const pending = waiting?.(name) === true}
    {@const where = besides?.(name)}
    {@const some = partly?.(name)}
    <span
      class="whitespace-nowrap"
      data-marked={filtered ? "" : undefined}
      data-tag={name}
      transition:unfold={{ fade: true }}
    >
      <span
        title={filed
          ? "filed the item — cancel the routing to take it off"
          : pending
            ? WAITING
            : undefined}
        class="{CHIP} {filtered || filed ? 'border-ink' : ''} {pending
          ? 'text-muted'
          : ''} {some === undefined ? '' : 'border-dashed bg-transparent'}"
      >
        {#if some !== undefined}
          <button
            type="button"
            aria-label="put {name} on every one, on {some} now"
            onclick={() => onadd(name)}
            class="inline-flex items-center gap-1"
            >{@render said(name)}<span class="text-muted tabular-nums"
              >{some}</span
            ></button
          >
        {:else if fired === undefined && !pending}
          {@render said(name)}
        {:else}
          <span aria-hidden="true"
            >{@render said(
              fired === undefined ? name : trigger(name),
              fired !== undefined,
            )}</span
          ><span class="sr-only"
            >{[
              name,
              fired === undefined ? undefined : `routes to ${fired}`,
              pending ? WAITING : undefined,
            ]
              .filter((part) => part !== undefined)
              .join(", ")}</span
          >
        {/if}
        {#if filed}
          <Icon name="lock" class="ml-1 size-3.5" />
        {:else if addable && !inert}
          <button
            type="button"
            aria-label={`remove ${name}`}
            onclick={(event) => {
              event.stopPropagation();
              onremove(name);
            }}
            class="relative -mr-1 ml-1 grid place-items-center text-muted before:absolute before:-inset-2.5 before:content-[''] hover:text-ink"
          >
            <Icon name="close" class="size-3.5" />
          </button>
        {/if}
      </span>
      {#if where !== undefined}<span class="pr-tag">{where}</span>{/if}
    </span>
  {/each}
{/snippet}

{#snippet entry(classes: string)}
  <!-- svelte-ignore a11y_autofocus -->
  <input
    bind:this={line}
    autofocus={!field}
    bind:value={draft}
    onblur={field || stepping !== undefined ? undefined : close}
    inert={step !== undefined}
    {onkeydown}
    spellcheck="false"
    autocapitalize="off"
    autocomplete="off"
    aria-label={label}
    placeholder={field ? "Add a tag" : ""}
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={(adding || field) && rows.length > 0}
    aria-controls="{id}-tags"
    aria-activedescendant={step === undefined ? active : undefined}
    class={classes}
    in:drawOut
  />
{/snippet}

{#snippet place()}
  <!-- The line's place, held whether or not it is open: at least the room the
     line opens at, so the `+` wraps where the line would and opening it moves
     nothing. Open, the line takes what is left of its row. The offer hangs
     from the place rather than the line, which is gone before the offer has
     finished closing. -->
  <span
    class="h-(--text-body--line-height) min-w-tag-line flex-1 self-start {names.length >
    0
      ? 'pl-tag'
      : ''}"
  >
    <span class="block h-full" style="anchor-name: {anchor}">
      {#if adding}
        {@render entry(
          "h-full min-h-6 w-full rounded-tag border border-ink bg-paper px-1.5 text-small outline-none",
        )}
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
          class="{addable
            ? 'inline-flex'
            : 'hidden'} relative min-h-6 items-center gap-1 rounded-tag border border-dashed border-edge px-1.5 text-small text-muted before:absolute before:-inset-2.5 before:content-['']"
          ><span aria-hidden="true">+</span> tag</button
        >
      {/if}
    </span>
  </span>
{/snippet}

{#snippet listbox()}
  <div
    id="{id}-tags"
    role="listbox"
    aria-label={step === undefined ? "Tags in use" : step.label}
    class="divide-y divide-rule"
  >
    {#each rows as row, index (row.fresh ? `fresh:${row.label}` : row.label)}
      {@const on = at === index}
      {@const fired = step !== undefined ? undefined : fires?.(row.label)}
      {#if row.apart}
        <div aria-hidden="true" class="h-2 border-b border-rule bg-band"></div>
      {/if}
      <Walked
        id={on ? `${id}-tag-${index}` : undefined}
        {on}
        onhover={() => (at = index)}
        ontake={() =>
          step === undefined ? take(row.label) : give(row.value ?? row.label)}
      >
        <span
          class="flex min-h-target items-center justify-between gap-3 px-gutter {on
            ? 'bg-off'
            : ''}"
        >
          {#if step !== undefined}
            <span
              >{row.fresh
                ? `+ ${row.value ?? row.label}`
                : (row.value ?? row.label)}</span
            >
            <Icon name="chevron" class="size-5 flex-none" />
          {:else if fired !== undefined}
            <span aria-hidden="true" class={TRIGGER}
              >{#if row.fresh}+&nbsp;{/if}<Icon
                name="route"
                class="size-4"
              />{trigger(row.label)}</span
            ><span aria-hidden="true" class="text-small text-muted"
              >{fired}</span
            ><span class="sr-only"
              >{row.fresh ? "+ " : ""}{row.label}, routes to {fired}</span
            >
          {:else}
            <span
              >{#if row.fresh}+&nbsp;{/if}<span aria-hidden="true">#</span
              >{row.label}</span
            >{#if row.fresh}<span
                aria-hidden="true"
                class="text-small text-muted">new</span
              >{/if}
          {/if}
        </span>
      </Walked>
    {/each}
  </div>
{/snippet}

{#snippet offer()}
  {#if stepping !== undefined && step !== undefined}
    <!-- Asking for a value it is the quick route's shape: a sheet across a
       phone's foot, a dialog in the middle of a wide window, over a veil, with
       a field of its own for a typed answer. Closing it leaves the tag off. -->
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="{id}-step-title"
      class="fixed inset-x-0 top-[var(--visible-top,0px)] z-50 flex h-[var(--visible-height,100dvh)] items-end justify-center wide:items-center"
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="absolute inset-0 bg-veil"
        transition:fade|global
        onmousedown={(event) => {
          event.preventDefault();
          leaveOff();
        }}
      ></div>
      <div
        bind:this={panel}
        transition:asking|global
        class="relative max-h-[70%] w-full overflow-y-auto rounded-t-control border-t border-rule bg-paper wide:w-[26rem] wide:rounded-control wide:border"
      >
        <div id="{id}-step">
          <div
            class="flex min-h-bar items-center justify-between gap-3 border-b border-rule pl-gutter"
          >
            <span
              id="{id}-step-title"
              class="inline-flex items-center gap-2 font-display text-title lowercase"
              ><Icon name="route" />{trigger(stepping.tag)}</span
            >
            <button
              type="button"
              aria-label="Leave the tag off"
              onmousedown={(event) => event.preventDefault()}
              onclick={leaveOff}
              class="grid min-h-target min-w-target place-items-center"
            >
              <Icon name="close" />
            </button>
          </div>
          <div class="px-gutter py-3">
            <span class="block">{stepping.ask.template}</span>
            <small class="block text-small text-muted"
              >{step.label}{#if step.default !== undefined}, default {step.default}{/if}</small
            >
          </div>
        </div>
        <div class="border-b border-rule px-gutter pb-3">
          <input
            {@attach (node) => node.focus({ preventScroll: true })}
            bind:value={draft}
            {onkeydown}
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            aria-label={step.label}
            placeholder={step.default ?? ""}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={rows.length > 0}
            aria-controls="{id}-tags"
            aria-activedescendant={active}
            aria-describedby="{id}-step"
            class="min-h-11 w-full rounded-control border border-rule bg-tag px-3 caret-ink outline-none placeholder:text-muted focus:border-ink"
          />
        </div>
        {@render listbox()}
      </div>
    </div>
  {:else if (adding || field) && rows.length > 0}
    <!-- Rows taken on `mousedown` with the default prevented, so taking one
       never blurs the line out from under the click. -->
    <!-- Hung from the line where the browser can tie it there, and from the
       start of the set's own row where it cannot; the set's container is
       what it is placed against, so callers make that container relative. -->
    <div
      class={field ? "mb-2 basis-full" : "offer z-30"}
      style="position-anchor: {anchor}"
      in:hung|global
      out:unhung|global
    >
      <div
        bind:this={panel}
        class="overflow-y-auto rounded-control border border-rule bg-paper {field
          ? 'max-h-72 w-full'
          : 'my-1 max-h-72 w-max max-w-[min(22rem,calc(100vw-2*var(--spacing-gutter)))] min-w-56'}"
      >
        {@render listbox()}
      </div>
    </div>
  {/if}
{/snippet}

{#if field}
  <span
    class="relative flex min-h-11 basis-full items-center rounded-control border border-rule bg-tag focus-within:border-ink"
  >
    <span aria-hidden="true" class="pl-3 text-muted">#</span>
    {@render entry(
      "min-w-0 flex-1 bg-transparent py-2.5 pr-3 pl-1 caret-ink outline-none placeholder:text-muted",
    )}
  </span>
  {@render offer()}
  {@render carried()}
{:else}
  {@render carried()}
  {@render place()}
  {@render offer()}
{/if}
