<script lang="ts">
  import {
    saidBy,
    type CandidateEntry,
    type DestinationCandidates,
    type RememberedPlace,
  } from "@notemap/client";

  import { untrack } from "svelte";

  import Lead from "$components/primitives/text/Lead.svelte";
  import Walked from "$components/primitives/composer/Walked.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { commits } from "$lib/command/keys";
  import { nameOf } from "$lib/destinations";
  import { recall, remember } from "$lib/candidate-cache";
  import { following } from "$lib/motion";
  import { client } from "$lib/client";
  import { forecastOf, type Said } from "$lib/forecast";
  import {
    alignedTo,
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
    steppedBack,
    textOf,
    walkStart,
    withTyping,
    type Level,
    type Refusal,
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
    onrelease,
    onforecast,
    claims = true,
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
    /** Backspacing past the head of an empty line: a wrong destination is not a reason to close. */
    onrelease?: () => void;
    /** What committing now would do, which decides what else the surface asks. */
    onforecast?: (word: "create" | "append" | undefined) => void;
    /** Takes the caret when drawn, which a form whose first field is something else does not want. */
    claims?: boolean;
  } = $props();

  const id = $props.id();

  let levels = $state<readonly Level[]>([]);
  let at = $state(0);
  /** Whether `↑↓` has been used since the list last changed, which is what makes `⏎` mean *take this one*. */
  let moved = $state(false);
  let input = $state<HTMLInputElement | undefined>(undefined);
  let shown = $state<HTMLElement | undefined>(undefined);
  let list = $state<HTMLElement | undefined>(undefined);
  /**
   * The height the list stood at before the path moved to a folder nobody has
   * answered for yet, held until one does: its rows go at once, and the list
   * settles once, on the answer, rather than collapsing and growing again.
   */
  let floor = $state<number | undefined>(undefined);

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
  const scopes = $derived(scopesAlong(path));
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
  $effect(() => {
    if (claims) input?.focus();
  });

  // Every answer but the newest is dropped: typing a segment leaves several
  // rounds of asks in flight, and without this a slower one paints the entries
  // of a scope already left.
  let asking = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The newest round of asks is still out. */
  let unanswered = $state(false);

  // Before the DOM moves, so the height held is the one the list stood at.
  $effect.pre(() => {
    const asked = scopes;
    const mine = (asking += 1);

    // What is still true is drawn while everything is asked for again: the
    // levels the path still runs through, then whatever was last told about
    // the rest. Untracked: the answer below writes `levels`, and an effect
    // depending on it would ask again for every answer it drew.
    untrack(() => {
      const kept = [...alignedTo(levels, asked), ...heldPast(levels, asked)];
      if (kept.length < asked.length) floor ??= list?.offsetHeight;
      levels = kept;
    });

    clearTimeout(timer);
    timer = setTimeout(() => {
      unanswered = true;
      void (async () => {
        const answers = await Promise.all(asked.map(askAbout));
        if (mine !== asking) return;

        levels = answers;
        unanswered = false;
        floor = undefined;
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
        refusal: "unreachable",
        why: saidBy(error),
      };
    }
  }

  /**
   * What each level past the ones still drawn was last told, so a line opened
   * a second time, or a folder gone back to, draws at once. A level per segment
   * is a request per segment, and this control asks them all again on every
   * keystroke that changes the path — the debounce spends 120ms of that wait,
   * and this fills the rest of it with what was true a moment ago. It stops at
   * the first scope nothing is held for, since levels are held by depth.
   */
  function heldPast(
    levels: readonly Level[],
    scopes: readonly string[],
  ): readonly Level[] {
    const held: Level[] = [];
    for (const scope of scopes.slice(alignedTo(levels, scopes).length)) {
      const kept = recall({
        destination,
        capability,
        field,
        ...(scope === "" ? {} : { scope }),
      });
      if (kept === undefined) break;
      held.push({ scope, entries: kept.entries, truncated: kept.truncated });
    }
    return held;
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
  ): { refusal: Refusal; why?: string } {
    if (answer.kind === "not-offered") return { refusal: "not offered" };
    if (answer.kind === "unusable") {
      return { refusal: "unusable", why: answer.detail };
    }
    return { refusal: "unreachable", why: answer.detail };
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

  function complete(): void {
    const finished = completionOf(caretIn?.entries ?? [], path.typing);
    if (finished !== undefined) onchange(withTyping(path, finished));
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Tab" && !event.shiftKey) {
      // With nothing to complete it does nothing, rather than handing focus to
      // whatever is next: the line is what the composer is for, and leaving it
      // is `⇧⇥` or the pointer.
      event.preventDefault();
      complete();
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
      const down = event.key === "ArrowDown";
      const step = down ? 1 : choices.length - 1;
      at = moved ? (at + step) % choices.length : walkStart(here, path, down);
      moved = true;
      return;
    }

    if (event.key === "Enter") {
      if (commits(event)) return;
      event.preventDefault();

      // A new note beside the one the line names, under the free name it
      // would get — written into the line rather than sent, like any `⏎`.
      if (event.metaKey || event.ctrlKey) {
        if (forecast?.beside === undefined) complete();
        else onchange(withTyping(path, forecast.beside));
        return;
      }

      const picked = choices[at];
      if (moved && picked !== undefined) taken(picked);
      else complete();
      return;
    }

    if (event.key === "Escape" && !event.isComposing && value !== "") {
      event.preventDefault();
      onchange(steppedBack(value));
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
    !moved || choices[at] === undefined ? undefined : `${id}-place-${at}`,
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
      aria-controls="{id}-places"
      aria-activedescendant={active}
      class="relative w-full bg-transparent text-transparent caret-ink outline-none"
    />
  </div>

  {#if refusal !== undefined}
    <p class="mt-3.5" title={why}>
      <Lead
        lead={refusal}
        rest={refusal === "unreachable" ? "best effort" : undefined}
      />
    </p>
  {/if}

  <div class="mt-2.5" {@attach following}>
    <div class="flow-root">
      <div
        bind:this={list}
        id="{id}-places"
        role="listbox"
        aria-label="places"
        style:min-height={floor === undefined
          ? undefined
          : `${String(floor)}px`}
      >
        {#if drawn.length === 0 && unanswered}
          <Asking subject={nameOf(destination)} />
        {/if}
        {#each drawn as row (`${row.depth}:${row.made === true ? "+" : ""}${row.entry.label}`)}
          {@const picked = moved && here[at] === row}
          <Walked
            id={picked ? `${id}-place-${at}` : undefined}
            on={picked}
            along={row.onPath || row.made === true || row.held === true}
            held={row.made === true || row.held === true}
            disabled={row.made === true}
            indent={row.depth}
            ontake={() => take(row.entry)}
          >
            <!-- Inline-block, so the row's underline stops at the name. -->
            {row.made === true
              ? `+ ${textOf(row.entry)}`
              : textOf(row.entry)}{#if row.held === true}<span
                class="ml-[1ch] inline-block font-normal">[append]</span
              >{/if}
          </Walked>
        {/each}
      </div>

      {#if caretIn?.truncated === true}
        <p class="mt-1">more than this shows</p>
      {/if}
    </div>
  </div>
</div>
