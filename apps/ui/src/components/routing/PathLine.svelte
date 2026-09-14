<script lang="ts">
  import {
    saidBy,
    type CandidateEntry,
    type DestinationCandidates,
    type RememberedPlace,
  } from "@notemap/client";

  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import Walked from "$components/primitives/composer/Walked.svelte";
  import { recall, remember } from "$lib/candidate-cache";
  import { client } from "$lib/client";
  import { forecastOf, type Said } from "$lib/forecast";
  import {
    completionOf,
    continuationOf,
    ghostFor,
    landedOn,
    levelAt,
    marked,
    parsePath,
    pathOf,
    pending,
    popped,
    reachable,
    rowsOf,
    scopesAlong,
    textOf,
    withTyping,
    type Level,
  } from "$lib/path-line";

  /**
   * One line holding a place, with the hierarchy along it drawn beneath. The
   * line is the value: there is no second control holding the same string, and
   * a folder that does not exist yet is typed rather than browsed to.
   */
  let {
    destination,
    capability,
    field,
    label,
    value,
    said,
    places = [],
    onchange,
    onsubmit,
    onrelease,
    onforecast,
  }: {
    destination: string;
    capability: string;
    field: string;
    label: string;
    value: string;
    /**
     * What the item says, so a path that named only a folder can show the name
     * the note is about to get rather than a gap. Absent where the control is
     * drawing a field that is not a note's place.
     */
    said?: Said;
    /** Places routed to before, as the pool answered them: what the greyed continuation is read from. */
    places?: readonly RememberedPlace[];
    onchange: (value: string) => void;
    /**
     * `⏎` on the line commits the whole composer. `beside` is `⇧⏎`: make a new
     * note rather than adding to the one that is there.
     */
    onsubmit?: (beside?: string) => void;
    /** Backspacing past the head of an empty line: a wrong destination is not a reason to close. */
    onrelease?: () => void;
    /** What committing now would do, which decides what else the surface asks. */
    onforecast?: (word: "create" | "append" | undefined) => void;
  } = $props();

  let levels = $state<readonly Level[]>([]);
  let at = $state(0);
  /** Whether `↑↓` has been used since the list last changed, which is what makes `⏎` mean *take this one*. */
  let moved = $state(false);
  let input = $state<HTMLInputElement | undefined>(undefined);
  let shown = $state<HTMLElement | undefined>(undefined);

  /**
   * The input's own text is transparent and the layer beneath is what is read,
   * so a line longer than the box has to be scrolled by the same amount or the
   * caret sits over the wrong character. Deep paths are what this control is
   * for, so this is not a rare state.
   */
  function follow(): void {
    if (shown !== undefined && input !== undefined) {
      shown.scrollLeft = input.scrollLeft;
    }
  }

  const path = $derived(parsePath(value));
  /**
   * The level the caret is in, which is not the deepest that answered: inside a
   * folder that is not there yet, that would be the folder above, and
   * completing from it puts a name in a place it was never listed.
   */
  const caretIn = $derived(levelAt(levels, path));

  /**
   * The root is the destination itself, so its answer is the one that says
   * whether anything can be asked at all. A deeper scope with nothing to say is
   * a folder still being typed, which is not a refusal of anything.
   */
  const refusal = $derived(levels[0]?.refusal);
  const why = $derived(levels[0]?.why);

  /**
   * Whether a remembered place is still there is checked for one reason now:
   * a vanished one is kept out of the greyed continuation, which is the thing a
   * person takes without reading.
   */
  const checked = $derived(marked(places, levels));
  const ghost = $derived(ghostFor(value, checked));

  const forecast = $derived(
    said === undefined ? undefined : forecastOf(levels, value, said),
  );

  $effect(() => onforecast?.(forecast?.word));

  /**
   * The typed tail that is not there yet, drawn under the deepest folder that
   * is rather than named off beside the word. Only where there is a forecast:
   * with nothing answered there is nothing to say is missing.
   */
  const drawn = $derived.by(() => {
    if (forecast === undefined) return rowsOf(levels, path);

    // Appending, the note's file is one the tree is already drawing, so the
    // pending tail is the folders alone and that row is marked instead.
    const appending = forecast.word === "append";
    const rows = rowsOf(
      levels,
      path,
      pending(path, forecast.making, appending ? undefined : forecast.leaf),
    );
    return appending ? landedOn(rows, path, forecast.leaf) : rows;
  });

  /** In the order they are drawn, so `↑↓` moves down the tree as the eye does. */
  const here = $derived(reachable(drawn));

  /** What `↑↓` walks: the tree as drawn. */
  const choices = $derived(
    here.map((row) => ({ kind: "entry" as const, row })),
  );

  // The place is what a surface with a destination settled is for, so the
  // caret is here rather than waiting to be clicked into.
  $effect(() => input?.focus());

  // Every answer but the newest is dropped: typing a segment leaves several
  // rounds of asks in flight, and without this a slower one paints the entries
  // of a scope already left.
  let asking = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const scopes = scopesAlong(path);
    const mine = (asking += 1);

    // Drawn while they are asked for again, and only where nothing is drawn
    // yet: replacing a tree that is already up with a shorter remembered one
    // would make it flicker under the caret on every keystroke.
    if (levels.length === 0) {
      const kept = heldAlong(scopes);
      if (kept.length > 0) levels = kept;
    }

    clearTimeout(timer);
    timer = setTimeout(() => {
      void (async () => {
        const answers = await Promise.all(scopes.map(askAbout));
        if (mine !== asking) return;

        levels = answers;
      })();
    }, 120);

    return () => clearTimeout(timer);
  });

  async function askAbout(scope: string): Promise<Level> {
    const asked = {
      destination,
      capability,
      field,
      ...(scope === "" ? {} : { scope }),
    };

    try {
      const answer = await client.destinations.candidates(destination, asked);

      if (answer.kind === "answered") {
        remember(asked, answer);
        return { scope, entries: answer.entries, truncated: answer.truncated };
      }
      return { scope, ...refused(answer) };
    } catch (error) {
      return {
        scope,
        refusal: "unreachable · best effort",
        why: saidBy(error),
      };
    }
  }

  /**
   * What each level along the path was last told, so a line opened a second
   * time draws its tree at once. A level per segment is a request per segment,
   * and this control asks them all again on every keystroke that changes the
   * path — the debounce spends 120ms of that wait, and this fills the rest of
   * it with what was true a moment ago.
   */
  function heldAlong(scopes: readonly string[]): readonly Level[] {
    return scopes.flatMap((scope) => {
      const kept = recall({
        destination,
        capability,
        field,
        ...(scope === "" ? {} : { scope }),
      });

      return kept === undefined
        ? []
        : [{ scope, entries: kept.entries, truncated: kept.truncated }];
    });
  }

  /**
   * A word and a mark, never a sentence. **`unreachable` here is the
   * destination**, not the pool — the pool being out of reach is a different
   * condition, and one in which the composer never opens, because the row's
   * `route` is disabled. It is an ordinary state and not one of the three
   * alarms: the line is still typed, the record is still made, and the delivery
   * is deferred, which is exactly what `best effort` says. The detail is kept
   * where a hover reaches it rather than spent on a line.
   */
  function refused(
    answer: Exclude<DestinationCandidates, { kind: "answered" }>,
  ): { refusal: string; why?: string } {
    if (answer.kind === "not-offered") return { refusal: "not offered" };
    if (answer.kind === "unusable") {
      return { refusal: "unusable", why: answer.detail };
    }
    return { refusal: "unreachable · best effort", why: answer.detail };
  }

  $effect(() => {
    // Whatever the caret was on stops meaning anything once the list beneath it
    // has changed.
    void choices;
    at = 0;
    moved = false;
  });

  // The whole line, not a segment appended to it: the tree shows every level at
  // once, so a folder two levels up is taken by going there rather than by
  // gluing its name onto the end of what is typed.
  function take(entry: CandidateEntry): void {
    onchange(pathOf(entry));
    input?.focus();
  }

  function taken(choice: (typeof choices)[number]): void {
    take(choice.row.entry);
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Tab" && !event.shiftKey) {
      // With nothing to complete it does nothing, rather than handing focus to
      // whatever is next: the line is what the composer is for, and leaving it
      // is `⇧⇥` or the pointer.
      event.preventDefault();
      const finished = completionOf(caretIn?.entries ?? [], path.typing);
      if (finished === undefined) return;
      onchange(withTyping(path, finished));
      return;
    }

    // `→` takes the whole remembered continuation and `⇥` completes one
    // segment. Two keys, never one: a single key meaning either depending on
    // invisible state is the failure mode this is avoiding.
    if (
      event.key === "ArrowRight" &&
      ghost !== undefined &&
      input?.selectionStart === value.length
    ) {
      const whole = continuationOf(value, checked);
      if (whole === undefined) return;
      event.preventDefault();
      onchange(whole);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (choices.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : choices.length - 1;
      at = moved
        ? (at + step) % choices.length
        : event.key === "ArrowDown"
          ? 0
          : choices.length - 1;
      moved = true;
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      // Nothing is taken, so there is nothing to make a new one beside: what
      // `create-or-append` will do is already make it.
      if (event.shiftKey) {
        onsubmit?.(forecast?.beside);
        return;
      }

      const picked = choices[at];
      // `↑↓` having moved is what makes `⏎` mean *take this one*; left alone it
      // means *route*, which is the ordinary way through the line.
      if (moved && picked !== undefined) taken(picked);
      else onsubmit?.();
      return;
    }

    // At the head of a segment there is no character to delete, and joining the
    // two names either side would make one nobody typed.
    if (
      event.key === "Backspace" &&
      path.typing === "" &&
      input?.selectionStart === value.length
    ) {
      event.preventDefault();
      if (value === "") onrelease?.();
      else onchange(popped(value));
    }
  }

  const settled = $derived(
    path.complete.length === 0 ? "" : `${path.complete.join("/")}/`,
  );

  const active = $derived(
    !moved || choices[at] === undefined ? undefined : `path-line-place-${at}`,
  );
</script>

<div>
  <div class="relative border-b border-ink px-2 py-0.5">
    <!-- The input's own text is transparent and this is what is read, so the
         completion offered can be drawn after what was typed. Alignment is
         exact: one face, one size, in both. -->
    <div
      bind:this={shown}
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 overflow-hidden px-2 py-0.5 whitespace-pre"
    >
      <span>{settled}{path.typing}</span>{#if ghost !== undefined}<span
          data-ghost
          class="text-inert">{ghost}</span
        >{/if}
    </div>

    <input
      bind:this={input}
      {value}
      oninput={(event) => {
        onchange(event.currentTarget.value);
        follow();
      }}
      onscroll={follow}
      onkeyup={follow}
      onclick={follow}
      {onkeydown}
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      aria-label={label}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={choices.length > 0}
      aria-controls="path-line-places"
      aria-activedescendant={active}
      class="relative w-full bg-transparent text-transparent caret-ink outline-none"
    />
  </div>

  {#if refusal !== undefined}
    <p class="mt-3.5" title={why}>{refusal}</p>
  {:else if forecast !== undefined}
    <!-- The name a derived leaf would get is not said here: the tree draws it
         where the note lands, which is where the eye already is. -->
    <div class="mt-3.5 flex items-baseline gap-x-3">
      <StateWord word={forecast.word} inline />
      {#if forecast.beside !== undefined}
        <!-- Beside the state it overrides rather than in the key hints:
             adding to somebody's note when a new one was meant is the one
             place *nothing to choose* can surprise. -->
        <button
          type="button"
          class="ml-auto shrink-0 hover:underline"
          onmousedown={(event) => {
            event.preventDefault();
            onsubmit?.(forecast.beside);
          }}>⇧⏎ {forecast.beside}</button
        >
      {/if}
    </div>
  {/if}

  <!-- A floor, so a shallow answer leaves room rather than collapsing the
       column and moving everything the eye is on. -->
  <div
    id="path-line-places"
    role="listbox"
    aria-label="places"
    class="mt-2.5 {refusal === undefined ? 'min-h-[12.5rem]' : ''}"
  >
    {#each drawn as row (`${row.depth}:${row.made === true ? "+" : ""}${row.entry.label}`)}
      {@const picked = moved && here[at] === row}
      <Walked
        id={picked ? `path-line-place-${at}` : undefined}
        on={picked}
        held={row.made === true || row.held === true}
        disabled={row.made === true}
        indent={row.depth}
        ontake={() => take(row.entry)}
      >
        {row.made === true ? `+ ${textOf(row.entry)}` : textOf(row.entry)}
      </Walked>
    {/each}
  </div>

  {#if caretIn?.truncated === true}
    <p class="mt-1">more than this shows</p>
  {/if}
</div>
