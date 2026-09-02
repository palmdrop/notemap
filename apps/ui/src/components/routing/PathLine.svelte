<script lang="ts">
  import {
    saidBy,
    type CandidateEntry,
    type RememberedPlace,
  } from "@notemap/client";

  import StateWord from "$components/primitives/marks/StateWord.svelte";
  import { client } from "$lib/client";
  import { forecastOf, type Said } from "$lib/forecast";
  import {
    completionOf,
    continuing,
    ghostFor,
    marked,
    parsePath,
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
    onchange,
    onsubmit,
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
    onchange: (value: string) => void;
    /**
     * `⏎` on the line commits the whole composer. `beside` is `⇧⏎`: make a new
     * note rather than adding to the one that is there.
     */
    onsubmit?: (beside?: string) => void;
  } = $props();

  let levels = $state<readonly Level[]>([]);
  /** As the pool answered them. Whether one is still there is marked against the listing, which arrives separately. */
  let places = $state<readonly RememberedPlace[]>([]);
  let at = $state(0);
  /** Whether `↑↓` has been used since the list last changed, which is what makes `⏎` mean *take this one*. */
  let moved = $state(false);
  let input = $state<HTMLInputElement | undefined>(undefined);

  const path = $derived(parsePath(value));
  const rows = $derived(rowsOf(levels, path));
  const here = $derived(reachable(rows));
  const deepest = $derived(
    levels.findLast((level) => level.entries !== undefined),
  );

  /**
   * The root is the destination itself, so its answer is the one that says
   * whether anything can be asked at all. A deeper scope with nothing to say is
   * a folder still being typed, which is not a refusal of anything.
   */
  const refusal = $derived(levels[0]?.refusal);

  const checked = $derived(marked(places, levels));
  const remembered = $derived(continuing(value, checked));
  const ghost = $derived(ghostFor(value, checked));

  /** The line as typed names a place that was routed to and is not there now. */
  const goneHere = $derived(
    checked.some((place) => place.value === value && place.gone),
  );

  /**
   * One list for `↑↓`: places used before rank above what the vault merely
   * offers, and a `gone` one is reachable here deliberately — which is what
   * makes it safe to keep it out of the ghost.
   */
  const choices = $derived([
    ...remembered.map((place) => ({ kind: "remembered" as const, place })),
    ...here.map((row) => ({ kind: "entry" as const, row })),
  ]);

  const forecast = $derived(
    said === undefined ? undefined : forecastOf(levels, value, said),
  );

  export function focus(): void {
    input?.focus();
  }

  // Every answer but the newest is dropped: typing a segment leaves several
  // rounds of asks in flight, and without this a slower one paints the entries
  // of a scope already left.
  let asking = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const scopes = scopesAlong(path);
    const mine = (asking += 1);

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

  $effect(() => {
    const wanted = { destination, capability, field };
    let live = true;

    void (async () => {
      try {
        const answer = await client.destinations.remembered(
          wanted.destination,
          {
            capability: wanted.capability,
            field: wanted.field,
          },
        );
        if (live) places = answer.places;
      } catch {
        // The pool answering nothing costs the line its ghost and nothing else.
        if (live) places = [];
      }
    })();

    return () => {
      live = false;
    };
  });

  async function askAbout(scope: string): Promise<Level> {
    try {
      const answer = await client.destinations.candidates(destination, {
        capability,
        field,
        ...(scope === "" ? {} : { scope }),
      });

      if (answer.kind === "answered") {
        return { scope, entries: answer.entries, truncated: answer.truncated };
      }
      return {
        scope,
        refusal:
          answer.kind === "not-offered"
            ? "not offered"
            : `${answer.kind} · ${answer.detail}`,
      };
    } catch (error) {
      return { scope, refusal: saidBy(error) };
    }
  }

  $effect(() => {
    // Whatever the caret was on stops meaning anything once the list beneath it
    // has changed.
    void choices;
    at = 0;
    moved = false;
  });

  function take(entry: CandidateEntry): void {
    onchange(withTyping(path, textOf(entry)));
    input?.focus();
  }

  function taken(choice: (typeof choices)[number]): void {
    // A remembered place is the whole line, not a segment of it.
    if (choice.kind === "remembered") {
      onchange(choice.place.value);
      input?.focus();
      return;
    }
    take(choice.row.entry);
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Tab" && !event.shiftKey) {
      const finished = completionOf(deepest?.entries ?? [], path.typing);
      if (finished === undefined) return;
      event.preventDefault();
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
      event.preventDefault();
      onchange(value + ghost);
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
      if (event.shiftKey) {
        if (forecast?.beside !== undefined) onsubmit?.(forecast.beside);
        return;
      }

      const chosen = choices[at];
      // `↑↓` having moved is what makes `⏎` mean *take this one*; left alone it
      // means *route*, which is the ordinary way through the line.
      if (moved && chosen !== undefined) taken(chosen);
      else onsubmit?.();
      return;
    }

    // At the head of a segment there is no character to delete, and joining the
    // two names either side would make one nobody typed.
    if (
      event.key === "Backspace" &&
      path.typing === "" &&
      value !== "" &&
      input?.selectionStart === value.length
    ) {
      event.preventDefault();
      onchange(popped(value));
    }
  }

  const settled = $derived(
    path.complete.length === 0 ? "" : `${path.complete.join("/")}/`,
  );
</script>

<div class="font-mono">
  <div class="relative border-b border-ink">
    <!-- The input's own text is transparent and this is what is read, so the
         settled part of the path and the one being typed can be drawn
         differently. Alignment is exact: one monospace face, one size. -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre"
    >
      <span class="text-ink-muted">{settled}</span><span class="text-ink"
        >{path.typing}</span
      >{#if ghost !== undefined}<span class="text-ink-muted" data-ghost
          >{ghost}</span
        >{/if}
    </div>

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
      aria-expanded={choices.length > 0}
      aria-controls="path-line-places"
      aria-activedescendant={moved && choices[at] !== undefined
        ? `path-line-place-${at}`
        : undefined}
      class="relative w-full bg-transparent text-transparent caret-ink outline-none"
    />
  </div>

  {#if refusal !== undefined}
    <p class="mt-2 text-ink-muted">{refusal}</p>
  {:else if forecast !== undefined}
    <div class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <StateWord word={forecast.word} inline />
      {#each forecast.making as folder (folder)}
        <span class="text-accent">+ {folder}/</span>
      {/each}
      {#if goneHere}
        <StateWord word="gone" inline />
      {/if}
      {#if forecast.derived}
        <span class="text-ink-muted">derived · {forecast.leaf}</span>
      {/if}
      {#if forecast.beside !== undefined}
        <!-- Beside the state it overrides rather than in the key hints:
             adding to somebody's note when a new one was meant is the one
             place *nothing to choose* can surprise. -->
        <button
          type="button"
          class="ml-auto text-ink-muted hover:text-accent"
          onmousedown={(event) => {
            event.preventDefault();
            onsubmit?.(forecast.beside);
          }}>⇧⏎ {forecast.beside}</button
        >
      {/if}
    </div>
  {/if}

  <div id="path-line-places" role="listbox" aria-label="places" class="mt-2">
    {#each remembered as place, index (place.value)}
      {@const chosen = moved && at === index}
      <div
        id={chosen ? `path-line-place-${at}` : undefined}
        role="option"
        tabindex="-1"
        aria-selected={chosen}
        class="flex cursor-default items-baseline gap-x-4 {chosen
          ? 'inverted'
          : place.gone
            ? 'text-ink-muted'
            : 'text-ink'}"
        onmousedown={(event) => {
          event.preventDefault();
          onchange(place.value);
          input?.focus();
        }}
      >
        <span>{place.value}</span>
        <span class="ml-auto text-ink-muted"
          >{place.uses}{place.gone ? " · gone" : ""}</span
        >
      </div>
    {/each}

    {#if remembered.length > 0 && rows.length > 0}
      <hr class="my-1.5 border-ink-muted" />
    {/if}

    {#each rows as row (`${row.depth}:${row.entry.scope ?? String(row.entry.value)}`)}
      {@const chosen =
        moved &&
        row.here &&
        choices[at]?.kind === "entry" &&
        here[at - remembered.length] === row}
      <div
        id={chosen ? `path-line-place-${at}` : undefined}
        role="option"
        tabindex="-1"
        aria-selected={chosen}
        style="padding-left: {row.depth * 1.1}rem"
        class="cursor-default {row.onPath || chosen
          ? 'text-ink'
          : 'text-ink-muted'} {chosen ? 'inverted' : ''}"
        onmousedown={(event) => {
          event.preventDefault();
          take(row.entry);
        }}
      >
        {textOf(row.entry)}
      </div>
    {/each}

    {#if deepest?.truncated === true}
      <p class="mt-1 text-ink-muted">more than this shows</p>
    {/if}
  </div>
</div>
