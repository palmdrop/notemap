<script lang="ts">
  import {
    saidBy,
    type CandidateEntry,
    type DestinationCandidates,
  } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import Walked from "$components/primitives/composer/Walked.svelte";
  import { client } from "$lib/client";
  import {
    completed,
    narrowed,
    readAs,
    resolved,
    takenAs,
    type Form,
  } from "$lib/candidate-list";
  import { recall, remember } from "$lib/candidate-cache";

  /**
   * The schema-driven control: one line holding the field, with what the
   * destination offers drawn beneath it and narrowed as it is typed into. The
   * line is the value — there is no second control holding the same string, and
   * a place the destination has never heard of is typed rather than browsed to.
   * Under `naming` the line reads the name and the field keeps the value, which
   * is the one case the two come apart: an id nobody can read is not a line
   * anybody can type.
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
    durable = false,
    naming = false,
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
    /**
     * Take the form of a value that survives a rename, where the destination
     * offered one. For a decision that fires again — a routing template on a
     * tag for months — rather than one made once, which prefers the readable
     * form and reads it back on the record.
     */
    durable?: boolean;
    /**
     * Type in names rather than in values: the line reads `Reading` while the
     * field keeps `12345`. For a field that may hold only what the destination
     * offered, where nothing is made here and the value is a handle a person
     * did not choose and cannot read.
     */
    naming?: boolean;
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
  /**
   * What is being typed, where that is not the value. Absent means the line
   * reads what the field holds, which is every keystroke of the ordinary mode
   * and the settled state of the other.
   */
  let draft = $state<string | undefined>(undefined);
  let entries = $state<readonly CandidateEntry[]>([]);
  let truncated = $state(false);
  let loading = $state(false);
  let refusal = $state<string | undefined>(undefined);
  let input = $state<HTMLInputElement | undefined>(undefined);

  /** Where `↑↓` stands, and whether it has been used since the list last changed. */
  let at = $state(0);
  let moved = $state(false);
  /**
   * What was typed by hand, held for as long as `⇥` is walking what matches it.
   * The walk writes each answer into the field, so a second press matching
   * against the field would be matching against its own last answer and find
   * one thing: the channel it just put there.
   */
  let stem = $state<string | undefined>(undefined);
  /** Whether the whole answer has been asked for, past the handful drawn by default. */
  let expanded = $state(false);

  /**
   * How many of an answer are drawn before one is asked for. An account of two
   * hundred are.na channels is a wall of names nobody reads, and the field
   * above is the way through it — so the list starts as a sample of what is
   * there and typing is what narrows it. Beyond the handful, `more` asks.
   */
  const HANDFUL = 8;

  const scope = $derived(history.at(-1)?.scope);
  const here = $derived(history.at(-1));

  /** The form the field keeps, and the form the line is typed in. */
  const keeps = $derived<Form>(durable ? "durable" : "value");
  const typing = $derived<Form>(naming ? "label" : keeps);

  /** What the line reads, which is the value itself unless names are typed. */
  const text = $derived(
    draft ?? (naming ? readAs(entries, value, keeps) : value),
  );

  /** Everything that matches what is typed, which is not all of what is drawn. */
  const matching = $derived(narrowed(entries, text));

  /**
   * What is drawn, and what the keyboard walks — the two being one list, since
   * a keyboard reaching a row the eye cannot see is a walk into nothing.
   */
  const shown = $derived(expanded ? matching : matching.slice(0, HANDFUL));

  const rest = $derived(matching.length - shown.length);

  // The place is what a composer with a destination in its chrome is for, so
  // the caret is here rather than waiting to be clicked into.
  $effect(() => input?.focus());

  $effect(() => {
    // Whatever the caret was on stops meaning anything once the list beneath it
    // has changed — and a handful of a *different* set is a handful again.
    void matching;
    at = 0;
    moved = false;
    expanded = false;
  });

  // Every answer but the newest is dropped: descending and coming straight
  // back leaves two asks in flight, and without this the slower one paints
  // its entries under the crumb trail of the scope already left.
  let asking = 0;

  $effect(() => {
    const asked = {
      destination,
      capability,
      field,
      ...(scope === undefined ? {} : { scope }),
    };
    const mine = (asking += 1);

    // What it answered last time, drawn while it answers again. The ask still
    // goes out, so this is only ever stale for as long as the round trip —
    // which is exactly the wait it exists to fill.
    const kept = recall(asked);
    if (kept === undefined) {
      loading = true;
    } else {
      entries = kept.entries;
      truncated = kept.truncated;
      loading = false;
    }
    refusal = undefined;

    void (async () => {
      try {
        const answer = await client.destinations.candidates(destination, asked);
        if (mine !== asking) return;
        if (answer.kind === "answered") remember(asked, answer);
        applied(answer);
      } catch (error) {
        if (mine !== asking) return;
        // What was held is kept rather than blanked: a browse that failed is
        // not evidence the last answer was wrong, and the field is typed
        // either way.
        if (kept === undefined) {
          entries = [];
          truncated = false;
        }
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
      if (entry.value !== undefined) took(takenAs(entry, keeps));
      input?.focus();
      return;
    }
    stem = undefined;
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
    stem = undefined;
    history = history.slice(0, -1);
  }

  function take(): void {
    if (here?.value !== undefined) took(here.value);
  }

  /** Settled from the list rather than typed, so the line goes back to reading the field. */
  function took(next: string): void {
    draft = undefined;
    onchange(next);
  }

  /**
   * Emptying the field, not choosing the top: what an empty value means is
   * the schema's business — for `create` it is the vault's own root.
   * Offered only at the top, since `back` is what leaves a scope.
   */
  function clear(): void {
    took("");
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Tab" && !event.shiftKey) {
      // With nothing to complete and nothing matching it does nothing, rather
      // than handing focus to whatever is next: the line is what the composer
      // is for, and leaving it is `⇧⇥` or the pointer.
      event.preventDefault();

      // Completion is the first press and only the first. Once the walk has
      // started, the field holds an answer rather than a name being typed, and
      // completing what was typed again would put the shared prefix back and
      // walk the same two answers forever.
      if (stem === undefined) {
        const finished = completed(entries, text, typing);
        if (finished !== undefined) {
          stem = text;
          typedIn(finished);
          return;
        }
      }

      // Completed as far as they agree, and there is still more than one: the
      // key walks them from here. A name shares its first letters with four
      // others far more often than it is the only one, and pressing `⇥` again
      // is what a person does about it.
      walk(stem ?? text);
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
      else {
        settle();
        onsubmit?.();
      }
      return;
    }

    if (event.key === "Backspace" && text === "") {
      event.preventDefault();
      onrelease?.();
    }
  }

  /**
   * The next thing still matching what was typed, in the order the destination
   * answered them, wrapping at the end. It takes the value rather than only
   * lighting a row: the field is the value here, so a walk that left it alone
   * would be a walk to nowhere.
   */
  function walk(typed: string): void {
    const hits = narrowed(entries, typed).filter(
      (entry) => entry.value !== undefined,
    );
    if (hits.length === 0) return;

    const here = hits.findIndex((entry) => takenAs(entry, keeps) === value);
    const next = hits[(here + 1) % hits.length];
    if (next === undefined) return;

    stem = typed;
    took(takenAs(next, keeps));
  }

  /**
   * A title typed becomes the value it names, at the two moments the line is
   * done being typed — committing from it, and leaving it. Never on a
   * keystroke: "Reading" would become a channel while "Reading Notes" was
   * still being written.
   */
  function settle(): void {
    if (draft === undefined) {
      const meant = resolved(entries, text, keeps);
      if (meant !== undefined) onchange(meant);
      return;
    }

    // Nothing the answer knows: taken as written, since an answer is one page
    // of what a destination holds and a channel it did not mention delivers
    // perfectly well.
    const written = draft;
    took(resolved(entries, written, keeps) ?? written);
  }

  /**
   * A keystroke. It is the value where the line holds one, and only a way to
   * find an entry where it holds a name — there the field keeps what it had
   * until the line is done being typed.
   */
  function typedIn(next: string): void {
    if (naming) draft = next;
    else onchange(next);
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
      value={text}
      oninput={(event) => {
        // Typed over: the walk is over too, and the field is the filter again.
        stem = undefined;
        typedIn(event.currentTarget.value);
      }}
      onblur={settle}
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
  {:else if text !== ""}
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
      <p class="text-ink-muted">loading…</p>
    {:else if refusal !== undefined && entries.length === 0}
      <p class="text-ink-muted">{refusal}</p>
    {:else}
      {#if refusal !== undefined}
        <!-- Held from the last ask, and the ask that just failed said so.
             Drawn rather than dropped: the field is typed either way. -->
        <p class="text-ink-muted">{refusal} · showing what it said before</p>
      {/if}
      {#each shown as entry, index (entry.scope ?? String(entry.value))}
        {@const picked = moved && at === index}
        <Walked
          id={picked ? `candidate-${index}` : undefined}
          on={picked}
          held={entry.value !== undefined && takenAs(entry, keeps) === value}
          dim={!picked}
          ontake={() => open(entry)}
        >
          {entry.scope !== undefined ? `${entry.label}/` : entry.label}
        </Walked>
      {/each}

      {#if rest > 0}
        <!-- The handful is a sample, not the answer: typing narrows it, and
             this asks for the whole of what was already fetched. -->
        <Action onclick={() => (expanded = true)}>{rest} more</Action>
      {/if}
      {#if shown.length === 0 && entries.length > 0}
        <p class="text-ink-muted">nothing here matches</p>
      {/if}
      {#if truncated && expanded}
        <!-- The destination held more than it answered, which is its own
             limit rather than this one. -->
        <p class="text-ink-muted">and more than it answered</p>
      {/if}
    {/if}
  </div>
</div>
