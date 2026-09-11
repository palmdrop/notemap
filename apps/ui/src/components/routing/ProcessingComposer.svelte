<script lang="ts">
  import { untrack } from "svelte";

  import {
    saidAs,
    saidBy,
    type Capability,
    type DestinationDescription,
    type Item,
    type RememberedPlace,
    type ResolvedRoutingTemplate,
    type RoutingPreview,
    type RoutingRecord,
    type RoutingTemplate,
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
  import { itemHref } from "$components/item/href";
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
  import { OWN_ARGUMENTS, sameArguments } from "$lib/arguments";
  import { fieldsOf, presetsFrom, valuesFrom } from "$lib/schema-form";

  const CREATE = "create";
  /** What the typed line drives: the capability that decides at delivery. */
  const CREATE_OR_APPEND = "create-or-append";
  /** The one field the typed line drives, and the only one `⇧⏎` has to re-read. */
  const LINE_FIELD = "path";

  let {
    item,
    onrouted,
    ondiscarded,
    onfired,
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
    /**
     * A tag taken here filed the item, so the decision this composer was for is
     * made and it closes on it. There is no record to hand over: what the tag
     * fired is said by the corner, which is where the window's cancel lives.
     */
    onfired?: () => void;
    onclose: () => void;
  } = $props();

  const destinations = client.destinations.all;
  const templates = client.templates.all;
  const pool = reachable();

  const offline = $derived(!pool.yes);

  /** What the row said, since the row itself is now behind the veil. */
  const subject = $derived(client.says(item) || item.payload.type);
  /** The item's own payload, from which the name of an unnamed note is derived. */
  const content = $derived(item.payload.content);
  /** What the capture says, which is what a rewrite starts from and what it replaces. */
  const captured = $derived(client.says(item));
  /**
   * What the item carries, read from the client's held copy rather than the
   * item this opened on: a tag taken in the row below lands on the held copy
   * first, and the row draws it taken the moment it does.
   */
  const held = $derived(client.held(item.id));
  const tags = $derived((($held ?? item).tags ?? []).map((tag) => tag.name));

  /** Taken by hand: `manual`, which has a step, or `discard`, which acts. */
  let hand = $state<typeof MANUAL | undefined>(undefined);
  /** What `manual` is told beyond the fact itself. */
  let went = $state("");
  let copied = $state(false);

  /** The template a decision started from, which the chrome names and the commit may carry. */
  let applied = $state<RoutingTemplate | undefined>(undefined);
  /** What it resolved to, so an untouched decision commits as the template rather than as a copy of it. */
  let resolved = $state<ResolvedRoutingTemplate | undefined>(undefined);

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

  /**
   * The words this one delivery carries, where a person took them from the
   * capture's. `undefined` is the ordinary case and means the item's own, and
   * so does anything equal to what the capture says: what reaches the record is
   * `carried()`'s answer rather than this.
   */
  let words = $state<string | undefined>(undefined);
  let typing = $state<HTMLTextAreaElement | undefined>(undefined);

  /** A boolean rather than `words` itself, so a keystroke does not take the caret back. */
  const rewriting = $derived(words !== undefined);

  $effect(() => {
    if (rewriting) typing?.focus();
  });

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
   * browser is asked, where it has more than one to be asked about.
   */
  const settles = $derived(
    destinationKind !== undefined &&
      browserFor(destinationKind) !== CandidateBrowser &&
      capabilities.some((one) => one.name === CREATE_OR_APPEND),
  );

  /**
   * A kind that can do one thing is not offering a choice, so it is not asked
   * to be made: are.na declares `create` and nothing else, and a step whose
   * every path is the same step is one press spent saying yes.
   */
  const only = $derived(
    capabilities.length === 1 ? capabilities[0]?.name : undefined,
  );

  /**
   * What the composer settles when nothing else has: the line's own capability
   * where the line is drawn, and the only one there is otherwise.
   *
   * **Only when nothing else has.** A template carries a capability, and it is
   * applied in the same step the description lands in — so this runs after it
   * and must not overwrite it. Left unguarded, a template saved as `create` on
   * a vault became `create-or-append` here, and the commit then read as a
   * decision of the person's own rather than as the template: the record did
   * not name it, and an `establish` template never learnt its folder was there.
   */
  const implied = $derived(settles ? CREATE_OR_APPEND : only);

  $effect(() => {
    if (implied !== undefined && capability === undefined) capability = implied;
  });

  /**
   * A field a destination says starts somewhere starts there. Only where a
   * template has not already filled the form: what a template saved *is* the
   * decision, and a default written into a field it deliberately left empty
   * would commit as a correction of it.
   *
   * What is held wins over what is offered, so this seeds a field once and
   * never argues with the person typing in it — including where they emptied
   * it, the field then holding `""` rather than nothing.
   */
  $effect(() => {
    if (applied !== undefined) return;

    const wanted = presetsFrom(fields);
    const held = untrack(() => args);
    const seeded = { ...wanted, ...held };
    if (Object.keys(seeded).length !== Object.keys(held).length) args = seeded;
  });

  /** Nothing to pick among is nothing to draw: the line and the fields are the whole decision. */
  const chooses = $derived(capabilities.length > 1 && implied === undefined);

  const ready = $derived(chosen !== undefined && capability !== undefined);

  /** Whether there is a step to go back to, which is what `esc` does first. */
  const settled = $derived(chosen !== undefined || hand !== undefined);

  const line = $derived(fields.find((one) => one.name === LINE_FIELD));

  /**
   * The line and what is consulted beside it, which is what earns two columns —
   * so it takes the line actually being drawn. A template that named `create`
   * on a vault settles a capability the line cannot draw, and a second column
   * consulting a line that is not there would be an empty half of a modal.
   */
  const split = $derived(chosen !== undefined && settles && line !== undefined);

  /**
   * A field beside the line goes only where the composer **knows** a new note is
   * being made — the heading an append would use being nothing to a note that
   * does not exist yet. An absent forecast is not knowing, and not knowing keeps
   * the field.
   *
   * Notemap's own arguments are not among them. A folder mode is a template's
   * promise about a place it files again and again; a decision made here is
   * made with the item in front of you, and the line already draws which folders
   * are not there yet. What a taken template resolved to still goes as it
   * resolved — this leaves it out of the form, not out of the request.
   */
  const beside = $derived(
    forecast === "create"
      ? []
      : fields.filter(
          (one) => one.name !== LINE_FIELD && !OWN_ARGUMENTS.includes(one.name),
        ),
  );

  /**
   * Taken, the choice leaves the line and reads here instead. The door says
   * `process` until there is a decision, and the true verb once there is one.
   */
  const chrome = $derived.by(() => {
    if (hand !== undefined) return `process · ${hand}`;
    if (applied !== undefined) return `process · ${applied.name}`;
    if (chosen === undefined) return "process";
    const name = $destinations.find((one) => one.id === chosen)?.name ?? "";
    return `process · ${name}`;
  });

  /** A wrong choice is not a reason to close the composer. */
  function release(): void {
    hand = undefined;
    applied = undefined;
    resolved = undefined;
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
  const decision = $derived(
    JSON.stringify({ chosen, capability, args, words }),
  );

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
        ...carried(),
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

    // Separately, and quietly: a pool that cannot answer for templates is a
    // band that stays empty, not a composer that cannot route to a destination.
    void client.templates.load().catch(() => undefined);
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

  /**
   * An untouched decision commits as the template, so the record names it and
   * an `establish` template learns that its folder is there. Corrected, it is a
   * decision of the person's own and goes as one — the template was where it
   * started, not what it stayed.
   */
  function requestFor(beside?: string) {
    const wanted = valuesFrom(fields, args);
    const untouched =
      beside === undefined &&
      applied !== undefined &&
      resolved !== undefined &&
      capability === resolved.capability &&
      sameArguments(wanted, resolved.arguments);

    if (untouched) {
      return { template: (applied as RoutingTemplate).id, ...carried() };
    }

    return {
      destination: chosen as string,
      ...(beside === undefined
        ? { capability: capability as string, arguments: wanted }
        : freshFile(beside)),
      ...carried(),
    };
  }

  /**
   * What this delivery says, where it is not what the item says. Words nobody
   * changed carry nothing: the presence of `content` on the record is the fact
   * that a person rewrote it, so opening the field and typing nothing must not
   * leave a record claiming a rewrite that never happened. Only the payload's
   * content is replaced, so the assets stay the capture's.
   */
  function carried(): { content?: Record<string, unknown> } {
    return words === undefined || words === captured
      ? {}
      : { content: saidAs(item.payload, words).content };
  }

  /**
   * Opens the capture's words for typing. They are not sticky: this composer is
   * one delivery, and wanting the fix everywhere is wanting `edit`.
   */
  function rewrite(): void {
    words = captured;
  }

  /** The way back: this delivery carries the capture's words after all. */
  function keep(): void {
    words = undefined;
  }

  function freshFile(beside: string): {
    capability: string;
    arguments: Record<string, unknown>;
  } {
    const place = placeOf(args[LINE_FIELD] ?? "");
    return {
      capability: CREATE,
      arguments: { directory: place.directory, filename: beside },
    };
  }

  function reasonFor(id: string, retired: boolean): string | undefined {
    if (retired) return "retired";
    if (offline) return "pool out of reach";
    return refusing[id];
  }

  /**
   * Why each entry cannot be taken, templates, destinations and the two by hand
   * alike. The line reads it to refuse a name, and the options draw it beside
   * one. Never a pattern: expansion is statically total, so a template that
   * saved applies to any item.
   */
  const unusable = $derived.by(() => {
    const all: Record<string, string | undefined> = {};
    for (const one of $destinations) {
      all[one.id] = reasonFor(one.id, one.retired === true);
    }
    for (const one of $templates) {
      all[one.id] = templateReason(one);
    }
    for (const one of HAND) {
      all[one.id] = refusalFor(one.id as ByHand, item, offline);
    }
    return all;
  });

  /**
   * What the cache alone can say. What only the destination can — a capability
   * it no longer declares — is learnt by taking one, as it is for a
   * destination, and lands in `refusing`.
   */
  function templateReason(one: RoutingTemplate): string | undefined {
    const destination = $destinations.find(
      (each) => each.id === one.destination,
    );
    if (destination === undefined) return "its destination was deleted";
    if (destination.retired === true) return "its destination is retired";
    if (offline) return "pool out of reach";
    return refusing[one.id];
  }

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
    // Read and done with before control is handed away: closing unmounts this
    // component, and a prop read after that is nobody's.
    const id = item.id;
    const about = aboutItem(item);

    void client.archive(id).catch((error: unknown) => {
      notices.raise({ what: saidBy(error), about, standing: true });
    });

    notices.raise({
      what: "discarded",
      about,
      href: itemHref(id),
      standing: true,
      only: DISCARD,
      offer: {
        label: "undo",
        take: () => {
          void client.unarchive(id).catch(() => {
            notices.raise({ what: "could not undo", about, standing: true });
          });
        },
      },
    });

    ondiscarded?.();
    onclose();
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

  /** The typed line knows only names and ids; which band one came from is read here. */
  async function taken(id: string) {
    const template = $templates.find((one) => one.id === id);
    if (template !== undefined) {
      await take(template);
      return;
    }
    await choose(id);
  }

  /**
   * A template is where the decision starts, not a form that refuses to be
   * corrected: what it resolved to is drawn on the line and stays editable.
   */
  async function take(one: RoutingTemplate) {
    release();
    applied = one;
    said = "";

    try {
      const answer = await client.templates.resolve(item.id, one.id);
      resolved = answer;
      // Handed to `choose` rather than set after it: a kind with one capability
      // has it picked as soon as the description lands, and a field drawn in
      // the gap before these arrive binds its own empty value back over them.
      await choose(answer.destination, {
        capability: answer.capability,
        arguments: Object.fromEntries(
          Object.entries(answer.arguments).map(([key, value]) => [
            key,
            typeof value === "string" ? value : String(value),
          ]),
        ),
      });
    } catch (error) {
      refusing = { ...refusing, [one.id]: saidBy(error) };
      applied = undefined;
      resolved = undefined;
    }
  }

  /**
   * I/O that may hang on an unmounted drive, so it happens for the chosen one
   * alone. `from` is where a template starts the decision, applied in the same
   * step the description lands in rather than after it.
   */
  async function choose(
    id: string,
    from?: {
      readonly capability: string;
      readonly arguments: Record<string, string>;
    },
  ) {
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
        if (from !== undefined) {
          capability = from.capability;
          args = from.arguments;
        }
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
   * The trigger tag of the template a decision committed as, put on the item
   * the moment it is routed — so an item filed by a template carries the same
   * classification whichever way the template was reached, and the tag says
   * what it says everywhere a tag is read.
   *
   * The record is what keeps this from filing a second copy: the pool absorbs a
   * trigger arriving where that template has already decided this item. So it
   * goes **after** the route, and only where the record names the template — a
   * decision the person corrected is their own and takes no tag.
   */
  function classify(record: RoutingRecord): void {
    const template = $templates.find(
      (one) => one.id === record.applied?.template,
    );
    const tag = template?.triggerTag;
    if (tag === undefined || tags.includes(tag)) return;

    // Refused, it is the outbox's to report, as every other tag's refusal is.
    void client.tag(item.id, tag).catch(() => undefined);
  }

  /**
   * `beside` is `⇧⏎`: the person meant a new note rather than an addition to
   * the one that is there, so it asks for `create`. Both file kinds refuse a
   * name that is taken rather than writing into it; the capability itself no
   * longer promises that, and a kind that cannot would clobber here.
   */
  async function send(beside?: string) {
    if (chosen === undefined || capability === undefined) return;

    busy = true;
    said = "routing…";
    try {
      const record = await client.routing.route(item.id, requestFor(beside));
      classify(record);
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
  {:else if field.options !== undefined}
    <!-- Chosen rather than typed: these values *are* the field, and taking the
         one already taken clears it, since absent is a value here too. -->
    <div>
      {#each field.options as one (one)}
        <Option
          label={one}
          chosen={args[field.name] === one}
          onchoose={() =>
            (args = {
              ...args,
              [field.name]: args[field.name] === one ? "" : one,
            })}
        />
      {/each}
    </div>
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

<Modal
  title={chrome}
  {subject}
  wide={split}
  onback={settled ? release : undefined}
  {onclose}
>
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
              destinations={[...$templates, ...$destinations, ...HAND]}
              {unusable}
              ontake={(id) => void taken(id)}
            />
          {/if}

          <!-- A band of its own, above the destinations: a template is a whole
               decision where a destination is the start of one. -->
          {#if $templates.length > 0}
            <div class="mb-1.5 border-b border-ink pb-1.5">
              {#each $templates as one (one.id)}
                <Option
                  label={one.name}
                  chosen={applied?.id === one.id}
                  why={unusable[one.id]}
                  onchoose={() => void take(one)}
                />
              {/each}
            </div>
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

        {#if chooses}
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
        <ComposerTags
          item={item.id}
          names={tags}
          onfired={() => {
            onfired?.();
            onclose();
          }}
        />
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

      <!-- What is being sent, above what it becomes: rewriting and previewing
           are one loop. Drawn only where a real destination is taken — `manual`
           and `discard` deliver nothing, so there is nothing to rewrite. -->
      {#if chosen !== undefined}
        <Labelled name="words">
          {#if words === undefined}
            <span class="min-w-0 break-words whitespace-pre-wrap"
              >{captured}</span
            >
            <Action onclick={rewrite}>rewrite</Action>
          {:else}
            <textarea
              bind:this={typing}
              bind:value={words}
              rows="4"
              aria-label="words"
              class="w-full resize-y px-2 py-0.5 font-mono outline-none field"
            ></textarea>
            <Action onclick={keep}>keep the capture's</Action>
          {/if}
        </Labelled>
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
            done
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
