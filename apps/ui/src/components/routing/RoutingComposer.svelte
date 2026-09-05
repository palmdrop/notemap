<script lang="ts">
  import {
    saidBy,
    type Capability,
    type DestinationDescription,
    type Item,
    type RememberedPlace,
    type RoutingPreview,
    type RoutingRecord,
  } from "@notemap/client";

  import ComposerTags from "$components/routing/ComposerTags.svelte";
  import DestinationLine from "$components/routing/DestinationLine.svelte";
  import UsedBefore from "$components/routing/UsedBefore.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Commit from "$components/primitives/composer/Commit.svelte";
  import Group from "$components/primitives/composer/Group.svelte";
  import Labelled from "$components/primitives/composer/Labelled.svelte";
  import Modal from "$components/primitives/composer/Modal.svelte";
  import Option from "$components/primitives/composer/Option.svelte";
  import { placeOf } from "@notemap/output-markdown/naming";

  import CandidateBrowser from "$components/routing/CandidateBrowser.svelte";
  import Output from "$components/routing/Output.svelte";
  import PathLine from "$components/routing/PathLine.svelte";
  import { browserFor } from "$lib/candidate-browsers";
  import { client } from "$lib/client";
  import { copyable } from "$lib/clipboard";
  import { aboutItem } from "$lib/excerpt";
  import { notices } from "$lib/notices.svelte";
  import {
    DISCARD,
    HAND,
    MANUAL,
    refusalFor,
    type ByHand,
  } from "$lib/processing";
  import { reachable } from "$lib/reachable.svelte";
  import {
    NO_PREVIEW_OFFERED,
    PREVIEW_IS_INDICATIVE,
    PREVIEW_NOT_TEXT,
    PREVIEW_UNREACHABLE,
  } from "$lib/said";
  import { fieldsOf, valuesFrom } from "$lib/schema-form";

  const CREATE_FILE = "create-file";
  /** What the typed line drives: the capability that decides at delivery. */
  const CREATE_OR_APPEND_FILE = "create-or-append-file";
  /** The one field the typed line drives, and the only one `⇧⏎` has to re-read. */
  const LINE_FIELD = "path";

  let {
    item,
    onrouted,
    ondiscarded,
    onclose,
  }: {
    item: Item;
    /**
     * The decision reached the pool. What is said about it, and where the row
     * stood, belong to the surface rather than to a modal over it.
     */
    onrouted?: (record: RoutingRecord) => void;
    /**
     * Discarding is the one decision the composer takes without a commit, so
     * the surface is told separately: an archived item leaves the queue the way
     * a routed one does.
     */
    ondiscarded?: () => void;
    onclose: () => void;
  } = $props();

  const destinations = client.destinations.all;
  const pool = reachable();

  const offline = $derived(!pool.yes);

  /** What the row said, since the row itself is now behind the veil. */
  const subject = $derived(client.says(item) || item.payload.type);
  /** The item's own payload, from which the name of an unnamed note is derived. */
  const content = $derived(item.payload.content);
  /** What the item already carries, so the composer's own row draws them as taken. */
  const tags = $derived((item.tags ?? []).map((tag) => tag.name));

  /** Taken by hand: `manual`, which has a step, or `discard`, which acts. */
  let hand = $state<typeof MANUAL | undefined>(undefined);
  /** What `manual` is told beyond the fact itself. */
  let went = $state("");
  let copied = $state(false);

  let chosen = $state<string | undefined>(undefined);
  let described = $state<DestinationDescription | undefined>(undefined);
  let capability = $state<string | undefined>(undefined);
  let args = $state<Record<string, string>>({});
  let said = $state("");
  let busy = $state(false);

  /** Places routed to before, consulted in the column beside the line. */
  let places = $state<readonly RememberedPlace[]>([]);
  /** Which of them the line's own `↑↓` walk has landed on. */
  let picked = $state<number | undefined>(undefined);
  /** What committing the line now would do, which decides what else is asked. */
  let forecast = $state<"create" | "append" | undefined>(undefined);

  /** Why one cannot be routed to, learnt by asking it. Retirement needs no asking. */
  let refusing = $state<Record<string, string>>({});

  let shown = $state<RoutingPreview | undefined>(undefined);
  let showing = $state(false);

  const capabilities = $derived<readonly Capability[]>(
    described?.kind === "described" ? described.capabilities : [],
  );

  const fields = $derived(
    fieldsOf(
      capabilities.find((one) => one.name === capability)?.argumentsSchema,
    ),
  );

  const destinationKind = $derived(
    $destinations.find((one) => one.id === chosen)?.kind,
  );

  /**
   * Where the line is what draws the place, *what will happen* is not a step:
   * it is read off the line and said in one word, and `⇧⏎` is the way to the
   * one capability that overrides it. A kind that draws the schema-driven
   * browser still chooses, because its capabilities are its own and nothing
   * here can pick among them.
   */
  const settles = $derived(
    destinationKind !== undefined &&
      browserFor(destinationKind) !== CandidateBrowser &&
      capabilities.some((one) => one.name === CREATE_OR_APPEND_FILE),
  );

  $effect(() => {
    if (settles) capability = CREATE_OR_APPEND_FILE;
  });

  const ready = $derived(chosen !== undefined && capability !== undefined);

  /** The line and what is consulted beside it, which is what earns two columns. */
  const split = $derived(chosen !== undefined && settles);

  const line = $derived(fields.find((one) => one.name === LINE_FIELD));

  /**
   * A field beside the line goes only where the composer **knows** a new note is
   * being made — the heading an append would use being nothing to a note that
   * does not exist yet. An absent forecast is not knowing, and not knowing keeps
   * the field.
   */
  const beside = $derived(
    forecast === "create"
      ? []
      : fields.filter((one) => one.name !== LINE_FIELD),
  );

  /**
   * Taken, the choice leaves the line and reads here instead. The door says
   * `process` until there is a decision, and the true verb once there is one.
   */
  const chrome = $derived.by(() => {
    if (hand !== undefined) return `process · ${hand}`;
    if (chosen === undefined) return "process";
    const name = $destinations.find((one) => one.id === chosen)?.name ?? "";
    return `process · ${name}`;
  });

  /** A wrong choice is not a reason to close the composer. */
  function release(): void {
    hand = undefined;
    went = "";
    copied = false;
    chosen = undefined;
    described = undefined;
    capability = undefined;
    args = {};
    said = "";
    places = [];
    forecast = undefined;
  }

  /** Serialised because a keystroke changes a field of `args` rather than `args`. */
  const decision = $derived(JSON.stringify({ chosen, capability, args }));

  // What was shown was shown for the decision as it then stood, so changing any
  // part of it drops the answer rather than leaving a stale one under the line.
  $effect(() => {
    void decision;
    shown = undefined;
  });

  /** On demand and never on a keystroke: the conversion may be a model call. */
  async function show() {
    if (chosen === undefined || capability === undefined) return;

    // The answer belongs to the decision it was asked with. One that resolves
    // after the person has moved on is dropped rather than drawn under
    // arguments it knows nothing about.
    const asked = decision;
    showing = true;
    said = "";
    try {
      const answer = await client.routing.preview(item.id, {
        destination: chosen,
        capability,
        arguments: valuesFrom(fields, args),
      });
      if (asked === decision) shown = answer;
    } catch (error) {
      if (asked === decision) said = saidBy(error);
    } finally {
      showing = false;
    }
  }

  const nothingShown = $derived.by(() => {
    switch (shown?.kind) {
      case "not-offered":
        return NO_PREVIEW_OFFERED;
      case "unreachable":
        return `${PREVIEW_UNREACHABLE} ${shown.detail}`;
      case "rejected":
        return `This would be refused: ${shown.detail}`;
      case "previewed":
        return shown.content !== undefined && shown.content.text === undefined
          ? `${PREVIEW_NOT_TEXT} ${shown.content.mediaType}`
          : "";
      default:
        return "";
    }
  });

  // Which destinations exist is not stable for the life of a connection, so
  // opening the composer reads them again rather than trusting what it holds.
  $effect(() => {
    void (async () => {
      try {
        await client.destinations.load();
      } catch (error) {
        said = saidBy(error);
      }
    })();
  });

  // The pool answers these, so they are asked once the destination is settled
  // and the field the line drives is known.
  $effect(() => {
    if (
      chosen === undefined ||
      capability === undefined ||
      line === undefined
    ) {
      return;
    }

    const wanted = { destination: chosen, capability, field: line.name };
    let live = true;

    void (async () => {
      try {
        const answer = await client.destinations.remembered(
          wanted.destination,
          { capability: wanted.capability, field: wanted.field },
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

  function freshFile(beside: string): {
    capability: string;
    arguments: Record<string, unknown>;
  } {
    const place = placeOf(args[LINE_FIELD] ?? "");
    return {
      capability: CREATE_FILE,
      arguments: { directory: place.directory, filename: beside },
    };
  }

  function reasonFor(id: string, retired: boolean): string | undefined {
    if (retired) return "retired";
    if (offline) return "pool out of reach";
    return refusing[id];
  }

  /**
   * Why each entry cannot be taken, destinations and the two by hand alike.
   * The line reads it to refuse a name, and the options draw it beside one.
   */
  const unusable = $derived.by(() => {
    const all: Record<string, string | undefined> = {};
    for (const one of $destinations) {
      all[one.id] = reasonFor(one.id, one.retired === true);
    }
    for (const one of HAND) {
      all[one.id] = refusalFor(one.id as ByHand, item, offline);
    }
    return all;
  });

  /** The note takes the caret the way the place line does when a place is taken. */
  let note = $state<HTMLInputElement | undefined>(undefined);

  $effect(() => {
    if (hand === MANUAL) note?.focus();
  });

  /**
   * `discard` acts when it is taken and nothing else in the list does. It needs
   * no arguments and no second step, and making the queue's commonest gesture
   * wait for a commit would spend three where the row used to spend one. What
   * pays for the inconsistency is the offer in the corner.
   */
  function discard() {
    const about = aboutItem(item);
    ondiscarded?.();
    onclose();

    notices.raise({
      what: "discarded",
      about,
      standing: true,
      only: DISCARD,
      offer: {
        label: "undo",
        take: () => {
          void client.unarchive(item.id).catch(() => {
            notices.raise({ what: "could not undo", about, standing: true });
          });
        },
      },
    });

    void client.archive(item.id).catch((error: unknown) => {
      notices.raise({ what: saidBy(error), about, standing: true });
    });
  }

  /** Routing whose destination is the person, with what they wrote about it. */
  async function mark() {
    if (busy) return;

    const note = went.trim();
    busy = true;
    said = "marking…";
    try {
      const record = await client.routing.markProcessed(
        item.id,
        note === "" ? undefined : note,
      );
      onrouted?.(record);
      onclose();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }

  /** The one control here whose result is nowhere on the screen, so it says so. */
  async function copy() {
    try {
      await navigator.clipboard.writeText(client.says(item));
      copied = true;
    } catch (error) {
      said = saidBy(error);
    }
  }

  /** I/O that may hang on an unmounted drive, so it happens for the chosen one alone. */
  async function choose(id: string) {
    if (id === DISCARD) {
      discard();
      return;
    }

    if (id === MANUAL) {
      hand = MANUAL;
      return;
    }

    chosen = id;
    described = undefined;
    capability = undefined;
    args = {};
    said = "";
    places = [];
    forecast = undefined;

    try {
      const report = await client.destinations.describe(id);
      if (report.kind === "described") {
        described = report;
        return;
      }

      // Present and unavailable: it stays in the list saying why, rather than
      // disappearing or looking routable.
      refusing = { ...refusing, [id]: `${report.kind} — ${report.detail}` };
      chosen = undefined;
    } catch (error) {
      refusing = { ...refusing, [id]: saidBy(error) };
      chosen = undefined;
    }
  }

  /**
   * `beside` is `⇧⏎`: the person meant a new note rather than an addition to
   * the one that is there, and `create-file` is the capability that promises
   * exactly that — it refuses a name that is taken rather than writing into it.
   */
  async function send(beside?: string) {
    if (chosen === undefined || capability === undefined) return;

    busy = true;
    said = "routing…";
    try {
      const record = await client.routing.route(item.id, {
        destination: chosen,
        ...(beside === undefined
          ? { capability, arguments: valuesFrom(fields, args) }
          : freshFile(beside)),
      });
      onrouted?.(record);
      onclose();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }
</script>

{#snippet control(field: (typeof fields)[number])}
  {@const title = field.title ?? field.name}
  {#if field.askable && chosen !== undefined && capability !== undefined && destinationKind !== undefined}
    {@const Browser = browserFor(destinationKind)}
    <Browser
      destination={chosen}
      {capability}
      field={field.name}
      label={title}
      value={args[field.name] ?? ""}
      said={field.name === LINE_FIELD ? { content, item: item.id } : undefined}
      onchange={(value) => (args = { ...args, [field.name]: value })}
      onsubmit={(beside) => void send(beside)}
      onrelease={release}
    />
  {:else}
    <!-- A typed field is a ground and never a rule: the only rule in the modal
         is the chrome's. -->
    <input
      bind:value={args[field.name]}
      placeholder={field.required ? "required" : "optional"}
      aria-label={title}
      class="w-full px-2 py-0.5 font-mono outline-none field placeholder:text-ink-muted"
    />
  {/if}
{/snippet}

<Modal title={chrome} {subject} wide={split} {onclose}>
  <!-- Above `where` is where a decision that arrived pre-filled with an
       attribution goes. Nothing produces that shape yet. -->

  <!-- Taken, the decision splits the composer: the line, the word it reads off
       and the tree on the left, everything consulted or settled after it on the
       right, ending in the commit. Untaken there is nothing to consult, so
       there is one column — the split is a consequence of the decision rather
       than a frame waiting for it. Below the register's own narrow breakpoint
       the two stack in reading order. -->
  <div
    class={split
      ? "mt-5 narrow:grid narrow:grid-cols-[1fr_var(--spacing-consult)] narrow:items-start narrow:gap-x-gap"
      : ""}
  >
    <div>
      {#if split && line !== undefined && chosen !== undefined && capability !== undefined}
        <PathLine
          destination={chosen}
          {capability}
          field={line.name}
          label={line.title ?? line.name}
          value={args[line.name] ?? ""}
          said={{ content, item: item.id }}
          {places}
          onchange={(value) => (args = { ...args, [line.name]: value })}
          onsubmit={(beside) => void send(beside)}
          onrelease={release}
          onforecast={(word) => (forecast = word)}
          onwalk={(at) => (picked = at)}
        />
      {:else}
        <Group name="where">
          {#if chosen === undefined && hand === undefined}
            <DestinationLine
              destinations={[...$destinations, ...HAND]}
              {unusable}
              ontake={(id) => void choose(id)}
            />
          {/if}
          {#each $destinations as one (one.id)}
            <Option
              label={one.name}
              chosen={chosen === one.id}
              why={unusable[one.id]}
              onchoose={() => void choose(one.id)}
            />
          {/each}

          <!-- The band below the rule is what the shell invents: `manual` is a
               destination the pool records and never lists, `discard` is not a
               destination at all. A label claiming the two have something in
               common would be saying more than is true. -->
          <div class="mt-1.5 border-t border-ink pt-1.5">
            {#each HAND as one (one.id)}
              <Option
                label={one.name}
                chosen={hand === one.id}
                why={unusable[one.id]}
                onchoose={() => void choose(one.id)}
              />
            {/each}
          </div>
        </Group>

        {#if hand === MANUAL}
          <Group name="where it went">
            <input
              bind:this={note}
              bind:value={went}
              onkeydown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void mark();
                } else if (event.key === "Backspace" && went === "") {
                  event.preventDefault();
                  release();
                }
              }}
              placeholder="optional"
              aria-label="where it went"
              class="w-full px-2 py-0.5 font-mono outline-none field placeholder:text-ink-muted"
            />
          </Group>
        {/if}

        {#if capabilities.length > 0 && !settles}
          <Group name="do">
            {#each capabilities as one (one.name)}
              <Option
                label={one.name}
                chosen={capability === one.name}
                onchoose={() => {
                  capability = one.name;
                  args = {};
                }}
              />
            {/each}
          </Group>
        {/if}

        <!-- A field's own `description` is a sentence written for a schema and
             is not drawn here: what a field means is its label and its control. -->
        {#each fields as field (field.name)}
          <Group name={field.title ?? field.name}
            >{@render control(field)}</Group
          >
        {/each}
      {/if}
    </div>

    <div class={split ? "*:first:mt-0" : ""}>
      {#if split}
        <UsedBefore
          {places}
          value={args[LINE_FIELD] ?? ""}
          chosen={picked}
          ontake={(taken) => (args = { ...args, [LINE_FIELD]: taken })}
        />

        <!-- Where the line draws the place, nothing here is a step: the line is
             the decision and what sits beside it is a terse row, as `tags` is. -->
        {#each beside as field (field.name)}
          <Labelled name={field.title ?? field.name}>
            {@render control(field)}
          </Labelled>
        {/each}
      {/if}

      {#if chosen !== undefined || hand !== undefined}
        <ComposerTags item={item.id} names={tags} />
      {/if}

      <!-- Offered and never automatic: taking `manual` says the thought was
           carried onward, which may have happened by acting rather than
           pasting, and the clipboard is not this composer's to overwrite
           unasked. -->
      {#if hand === MANUAL && copyable() && client.says(item) !== ""}
        <div class="mt-6">
          <Action onclick={() => void copy()}>
            {copied ? "copied" : "copy text"}
          </Action>
        </div>
      {/if}

      {#if shown !== undefined}
        <div class="mt-6">
          <Output
            heading="would write"
            note={shown.kind === "previewed" ? shown.note : undefined}
            text={shown.kind === "previewed" ? shown.content?.text : undefined}
            truncated={shown.kind === "previewed" &&
              shown.content?.truncated === true}
            said={nothingShown}
          />
          {#if shown.kind === "previewed"}
            <div class="mt-2 font-mono text-ink-muted">
              {PREVIEW_IS_INDICATIVE}
            </div>
          {/if}
        </div>
      {/if}

      <Commit>
        <!-- One door, and the true verb at the moment there is one to say. -->
        {#if hand === MANUAL}
          <Action primary disabled={busy} onclick={() => void mark()}>
            mark processed
          </Action>
        {:else}
          <Action primary disabled={!ready || busy} onclick={() => void send()}>
            route
          </Action>
          <Action
            disabled={!ready || busy || showing}
            onclick={() => void show()}
          >
            {showing ? "asking…" : "preview"}
          </Action>
        {/if}
        <Action onclick={onclose}>cancel</Action>
        {#if said !== ""}
          <span role="status" class="text-ink-muted">{said}</span>
        {/if}
      </Commit>
    </div>
  </div>
</Modal>
