<script lang="ts">
  import { onMount, untrack } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

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
  import { filenameFrom, placeOf } from "@notemap/output-markdown/naming";

  import CandidateBrowser from "$components/routing/CandidateBrowser.svelte";
  import ComposerTags from "$components/routing/ComposerTags.svelte";
  import DestinationLine from "$components/routing/DestinationLine.svelte";
  import PathLine from "$components/routing/PathLine.svelte";
  import Option from "$components/primitives/composer/Option.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import { itemHref, processHref } from "$components/item/href";
  import { OWN_ARGUMENTS, sameArguments } from "$lib/arguments";
  import { browserFor } from "$lib/candidate-browsers";
  import { client } from "$lib/client";
  import { nameOf } from "$lib/destinations";
  import { aboutItem } from "$lib/excerpt";
  import { search } from "$lib/matching";
  import { notices } from "$lib/notices.svelte";
  import { orderFor } from "$lib/order";
  import {
    DISCARD,
    HAND,
    MANUAL,
    refusalFor,
    type ByHand,
  } from "$lib/processing";
  import { discard, manual } from "$lib/quick";
  import { reachable } from "$lib/reachable.svelte";
  import { placeNamed, saidOf } from "$lib/routing";
  import { fieldsOf, presetsFrom, valuesFrom } from "$lib/schema-form";
  import { whenOf } from "$lib/when";

  import Band from "./Band.svelte";
  import Entry from "./Entry.svelte";
  import Preview from "./Preview.svelte";
  import Section from "./Section.svelte";

  const CREATE = "create";
  /** What the typed line drives: the capability that decides at delivery. */
  const CREATE_OR_APPEND = "create-or-append";
  /** The one field the typed line drives, and the only one `⇧⏎` has to re-read. */
  const LINE_FIELD = "path";

  /** A keystroke in the decision waits this long before the preview is asked for again. */
  const SETTLING = 400;

  let { item }: { item: Item } = $props();

  const destinations = client.destinations.all;
  const templates = client.templates.all;
  const queue = client.queue;
  const pool = reachable();

  const offline = $derived(!pool.yes);

  /** The item's own payload, from which the name of an unnamed note is derived. */
  const content = $derived(item.payload.content);
  /** What the capture says, which is what editing starts from and what it replaces. */
  const captured = $derived(client.says(item));
  const pictures = $derived(client.images(item));
  /**
   * What the item carries, read from the client's held copy rather than the
   * item this opened on: a tag taken here lands on the held copy first, and
   * the row draws it taken the moment it does.
   */
  const held = $derived(client.held(item.id));
  const tags = $derived((($held ?? item).tags ?? []).map((tag) => tag.name));

  /** The template a decision started from, which the commit may carry. */
  let applied = $state<RoutingTemplate | undefined>(undefined);
  /** What it resolved to, so an untouched decision commits as the template rather than as a copy of it. */
  let resolved = $state<ResolvedRoutingTemplate | undefined>(undefined);

  let chosen = $state<string | undefined>(undefined);
  let described = $state<DestinationDescription | undefined>(undefined);
  let capability = $state<string | undefined>(undefined);
  let args = $state<Record<string, string>>({});
  let said = $state("");
  let busy = $state(false);
  /** What the destination line holds, which narrows the bands under it. */
  let typed = $state("");

  /**
   * Whether the place line is drawn, over the read-only summary a taken
   * template resolved to. A destination chosen directly always wants the line;
   * a template starts read-only, since what it resolved to is already the
   * decision.
   */
  let placing = $state(true);

  /** Places routed to before, for the line's greyed continuation and the count beside the name. */
  let places = $state<readonly RememberedPlace[]>([]);
  /** What committing the line now would do, which decides what else is asked. */
  let forecast = $state<"create" | "append" | undefined>(undefined);

  /** Why one cannot be routed to, learnt by asking it. Retirement needs no asking. */
  let refusing = $state<Record<string, string>>({});

  let shown = $state<RoutingPreview | undefined>(undefined);
  let previewFailed = $state("");

  /**
   * The words this one delivery carries, where a person took them from the
   * capture's. `undefined` is the ordinary case and means the item's own, and
   * so does anything equal to what the capture says: what reaches the record is
   * `carried()`'s answer rather than this.
   */
  let words = $state<string | undefined>(undefined);
  let editing = $state(false);
  let typing = $state<HTMLTextAreaElement | undefined>(undefined);

  $effect(() => {
    if (editing) typing?.focus();
  });

  /** Which sections are open. The first always is; the rest open on a press or when the flow reaches them. */
  let opened = $state({ place: false, tags: false, preview: false });

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
   * What the surface settles when nothing else has: the line's own capability
   * where the line is drawn, and the only one there is otherwise.
   *
   * **Only when nothing else has.** A template carries a capability, and it is
   * applied in the same step the description lands in — so this runs after it
   * and must not overwrite it.
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

  const line = $derived(fields.find((one) => one.name === LINE_FIELD));

  /** Whether the typed line draws the place, which needs the destination to hold a filesystem. */
  const lined = $derived(chosen !== undefined && settles && line !== undefined);

  /**
   * A field beside the line goes only where the surface **knows** a new note is
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

  /** Whether every argument the capability requires has a value: what a preview waits for. */
  const settledArguments = $derived(
    fields
      .filter((one) => one.required)
      .every((one) => (args[one.name] ?? "").trim() !== ""),
  );

  /**
   * The full path the preview's head names: the destination and, from the
   * line where it draws one, the directory and the name a blank leaf would
   * get — the same code the line forecasts with. A kind with no line reads its
   * place the way a record does, off whatever the destination called its
   * arguments.
   */
  const previewPlace = $derived.by(() => {
    if (chosen === undefined) return undefined;

    const path = lined
      ? placeFor(args[LINE_FIELD] ?? "")
      : placeNamed(valuesFrom(fields, args));

    return path === undefined ? undefined : `${nameOf(chosen)} / ${path}`;
  });

  function placeFor(value: string): string {
    const place = placeOf(value);
    const filename = place.filename ?? filenameFrom(content, item.id);
    return place.directory === "" ? filename : `${place.directory}/${filename}`;
  }

  /** A wrong choice is not a reason to leave the surface. */
  function release(): void {
    applied = undefined;
    resolved = undefined;
    chosen = undefined;
    described = undefined;
    capability = undefined;
    args = {};
    said = "";
    places = [];
    forecast = undefined;
    shown = undefined;
    previewFailed = "";
    placing = true;
  }

  /** Serialised because a keystroke changes a field of `args` rather than `args`. */
  const decision = $derived(
    JSON.stringify({ chosen, capability, args, words }),
  );

  /**
   * Asked for as soon as the destination and its required arguments are
   * settled, and again whenever they or the words change, once the typing has
   * settled. What was shown stays up while the next answer is in flight.
   */
  $effect(() => {
    void decision;
    if (!ready || !settledArguments) return;

    const timer = setTimeout(() => void show(), SETTLING);
    return () => clearTimeout(timer);
  });

  async function show() {
    if (chosen === undefined || capability === undefined) return;

    // The answer belongs to the decision it was asked with. One that resolves
    // after the person has moved on is dropped rather than drawn under
    // arguments it knows nothing about.
    const asked = decision;
    try {
      const answer = await client.routing.preview(item.id, {
        destination: chosen,
        capability,
        arguments: valuesFrom(fields, args),
        ...carried(),
      });
      if (asked === decision) {
        shown = answer;
        previewFailed = "";
        opened.preview = true;
      }
    } catch (error) {
      if (asked === decision) {
        previewFailed = saidBy(error);
        opened.preview = true;
      }
    }
  }

  // Which destinations exist is not stable for the life of a connection, so
  // arriving reads them again rather than trusting what is held. The queue is
  // what `next` walks, and a deep link arrives without one.
  onMount(() => {
    void client.destinations.load().catch((error: unknown) => {
      said = saidBy(error);
    });

    // Separately, and quietly: a pool that cannot answer for templates is a
    // band that stays empty, not a surface that cannot route to a destination.
    void client.templates.load().catch(() => undefined);

    if (!$queue.items.some((one) => one.id === item.id)) {
      void client
        .enter("queue", orderFor("queue", page.url))
        .catch(() => undefined);
    }
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

  /** Read once on arrival: a count that re-dated itself as you typed would be noise. */
  const now = Date.now();

  /** What the chosen destination has been routed to before, said beside its name. */
  const usedBefore = $derived.by(() => {
    if (places.length === 0) return undefined;
    const routed = places.reduce((sum, place) => sum + place.uses, 0);
    const last = places
      .map((place) => place.lastAt)
      .sort()
      .at(-1);
    return last === undefined
      ? `${routed} routed`
      : `${routed} routed · last ${whenOf(last, now)}`;
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
   * Opens the capture's words for typing. They are this delivery's alone: the
   * item is never changed, and wanting the fix everywhere is wanting `edit` on
   * the row.
   */
  function edit(): void {
    words ??= captured;
    editing = true;
  }

  function done(): void {
    editing = false;
  }

  /** The way back: this delivery carries the capture's words after all. */
  function keep(): void {
    words = undefined;
    editing = false;
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
   * alike. The line reads it to refuse a name, and the bands draw it beside
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

  /** The three bands, narrowed together by what the line holds. */
  const byName = <T extends { readonly name: string }>(list: readonly T[]) =>
    search(list, typed, (one) => [one.name]);

  const templatesShown = $derived(byName($templates));
  const destinationsShown = $derived(byName($destinations));
  const handShown = $derived(byName(HAND));

  /** The one entry the line has narrowed to, which `⏎` takes and the bands draw bold. */
  const hit = $derived.by(() => {
    if (typed === "") return undefined;
    const all = [...templatesShown, ...destinationsShown, ...handShown].filter(
      (one) => unusable[one.id] === undefined,
    );
    return all.length === 1 ? all[0]?.id : undefined;
  });

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
      // What it resolved to is already the decision: the line stays behind
      // `edit` until somebody asks to correct it.
      placing = false;
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
      discard(item);
      advance();
      return;
    }

    if (id === MANUAL) {
      await manual(item);
      advance();
      return;
    }

    chosen = id;
    described = undefined;
    capability = undefined;
    args = {};
    said = "";
    places = [];
    forecast = undefined;
    opened.place = true;
    placing = true;

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
    if (chosen === undefined || capability === undefined || busy) return;

    busy = true;
    said = "routing…";
    try {
      const record = await client.routing.route(item.id, requestFor(beside));
      classify(record);
      notices.raise(
        saidOf(record, nameOf, {
          about: aboutItem(item),
          href: itemHref(item.id),
        }),
      );
      advance();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }

  /**
   * The queue in its current order, which is what the surface walks. Kept as
   * they stood while the item was still on the queue: a decision takes it off
   * before the surface moves on, and the row after it is still the one to go
   * to. An item that was never on the queue has no neighbours.
   */
  let around = $state<{ previous?: Item; next?: Item }>({});

  $effect(() => {
    const rows = $queue.items;
    const at = rows.findIndex((one) => one.id === item.id);
    if (at === -1) return;
    around = { previous: rows[at - 1], next: rows[at + 1] };
  });

  /**
   * After a decision the surface moves on to the next unprocessed item, and
   * returns to the queue when there is none. That is what a queue worked from
   * one end is.
   */
  function advance(): void {
    const next = around.next;
    void goto(next === undefined ? resolve("/") : processHref(next.id));
  }

  /** Back to the queue with this item still selected. */
  function back(): void {
    void goto(`${resolve("/")}?selected=${encodeURIComponent(item.id)}`);
  }

  function walk(to: Item | undefined): void {
    if (to !== undefined) void goto(processHref(to.id));
  }

  /** Whether the key was pressed in something a person is writing in. */
  function writing(target: EventTarget | null): target is HTMLElement {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    );
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (ready) void send();
      return;
    }

    if (writing(event.target)) {
      // The first press leaves the field; the next one leaves the surface.
      if (event.key === "Escape") event.target.blur();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    switch (event.key) {
      case "Escape":
        if (editing) done();
        else back();
        break;
      case "e":
        edit();
        break;
      case "[":
        walk(around.previous);
        break;
      case "]":
        walk(around.next);
        break;
      default:
        return;
    }
    event.preventDefault();
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
    <input
      bind:value={args[field.name]}
      placeholder={field.required ? "required" : "optional"}
      aria-label={title}
      class="w-full border-b border-ink px-2 py-0.5 outline-none"
    />
  {/if}
{/snippet}

{#snippet labelled(name: string, field: (typeof fields)[number])}
  <div
    class="mt-3 grid grid-cols-[9rem_1fr] items-baseline max-narrow:grid-cols-1"
  >
    <span class="tracking-caps uppercase">{name}</span>
    <div class="min-w-0">{@render control(field)}</div>
  </div>
{/snippet}

<svelte:window {onkeydown} />

<!-- The bar, then a frame whose head and foot are fixed and whose middle
     scrolls: two columns from `wide` up, stacked below. -->
<div
  class="mx-auto flex min-h-0 w-full max-w-read flex-1 flex-col wide:grid wide:max-w-measure-wide wide:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] wide:grid-rows-[1fr_auto]"
>
  <div
    class="flex max-h-[40%] flex-none flex-col border-b border-ink pt-5 pb-4 max-narrow:max-h-[34%] max-narrow:pt-3.5 max-narrow:pb-3 wide:row-span-2 wide:max-h-none wide:border-r wide:border-b-0 wide:pr-8 wide:pb-5"
  >
    <div class="mb-2 flex justify-between gap-x-[2ch]">
      <div class="flex flex-wrap items-baseline gap-x-[2ch]">
        <Stamp at={item.createdAt} inline />
        <span class="flex flex-wrap gap-x-[1ch]">
          {#each tags as tag (tag)}
            <span>{tag}</span>
          {/each}
        </span>
      </div>
      {#if !editing}
        <button
          type="button"
          onclick={edit}
          title="edit the words this delivery carries"
          class="hover:underline">edit</button
        >
      {/if}
    </div>

    {#each pictures as picture (picture)}
      <img
        src={picture}
        alt=""
        class="mb-2 block max-h-64 max-w-full flex-none object-contain object-left"
      />
    {/each}

    {#if editing}
      <textarea
        bind:this={typing}
        bind:value={words}
        aria-label="words"
        class="min-h-0 w-full flex-1 resize-none border border-ink bg-transparent px-3 py-2.5 outline-none"
      ></textarea>
      <div class="mt-2 flex justify-between">
        <button type="button" onclick={keep} class="hover:underline">
          keep the capture's
        </button>
        <button
          type="button"
          onclick={done}
          class="font-semibold hover:underline"
        >
          done
        </button>
      </div>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="min-h-0 max-w-prose overflow-auto break-words whitespace-pre-wrap"
        ondblclick={edit}
      >
        {words ?? captured}
      </div>
    {/if}
  </div>

  <div class="min-h-0 min-w-0 flex-1 overflow-auto wide:pt-2 wide:pl-8">
    <Section name="destination" open ontoggle={() => undefined}>
      {#if chosen === undefined}
        <DestinationLine
          destinations={[...$templates, ...$destinations, ...HAND]}
          {unusable}
          ontake={(id) => void taken(id)}
          ontyped={(text) => (typed = text)}
        />

        <div id="destination-bands">
          {#if templatesShown.length > 0}
            <Band name="templates">
              {#each templatesShown as one (one.id)}
                <Entry
                  label={one.name}
                  why={unusable[one.id]}
                  hit={hit === one.id}
                  onchoose={() => void take(one)}
                />
              {/each}
            </Band>
          {/if}

          {#if destinationsShown.length > 0}
            <Band name="destinations">
              {#each destinationsShown as one (one.id)}
                <Entry
                  label={one.name}
                  why={unusable[one.id]}
                  hit={hit === one.id}
                  onchoose={() => void choose(one.id)}
                />
              {/each}
            </Band>
          {/if}

          <!-- What the shell invents: `manual` is a destination the pool records
             and never lists, `discard` is not a destination at all. -->
          {#if handShown.length > 0}
            <Band name="otherwise">
              {#each handShown as one (one.id)}
                <Entry
                  label={one.name}
                  aside={one.id === MANUAL ? "processed by hand" : undefined}
                  alarm={one.id === DISCARD}
                  why={unusable[one.id]}
                  hit={hit === one.id}
                  onchoose={() => void choose(one.id)}
                />
              {/each}
            </Band>
          {/if}
        </div>
      {:else}
        <div class="flex items-baseline justify-between gap-x-[2ch]">
          <span class="flex min-w-0 flex-wrap items-baseline gap-x-[2ch]">
            <span class="font-semibold">
              {applied?.name ?? nameOf(chosen)}
            </span>
            {#if usedBefore !== undefined}
              <span>{usedBefore}</span>
            {/if}
          </span>
          <button type="button" onclick={release} class="hover:underline">
            change
          </button>
        </div>

        {#if chooses}
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
        {/if}
      {/if}
    </Section>

    <Section
      name="place"
      open={opened.place}
      ontoggle={() => (opened.place = !opened.place)}
    >
      {#if lined && line !== undefined && chosen !== undefined && capability !== undefined}
        {#if placing}
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
          />

          {#each beside as field (field.name)}
            {@render labelled(field.title ?? field.name, field)}
          {/each}
        {:else}
          <div class="flex items-baseline justify-between gap-x-[2ch]">
            <span class="min-w-0 break-words">{args[line.name] ?? ""}</span>
            <button
              type="button"
              aria-label="edit place"
              onclick={() => (placing = true)}
              class="hover:underline"
            >
              edit
            </button>
          </div>
        {/if}
      {:else if chosen !== undefined}
        <!-- A field's own `description` is a sentence written for a schema and
             is not drawn here: what a field means is its label and its control. -->
        {#each fields as field, at (field.name)}
          {#if at === 0}
            {@render control(field)}
          {:else}
            {@render labelled(field.title ?? field.name, field)}
          {/if}
        {/each}
      {/if}
    </Section>

    <Section
      name="tags"
      open={opened.tags || tags.length > 0}
      ontoggle={() => (opened.tags = !opened.tags)}
    >
      <ComposerTags
        item={item.id}
        names={tags}
        templates={($held ?? item).routing?.templates ?? []}
        onfired={advance}
      />
    </Section>

    <Section
      name="preview"
      open={opened.preview || shown !== undefined}
      ontoggle={() => (opened.preview = !opened.preview)}
    >
      {#if shown !== undefined}
        <Preview {shown} place={previewPlace} />
      {:else if previewFailed !== ""}
        <span role="status" class="text-alarm">{previewFailed}</span>
      {/if}
    </Section>

    {#if said !== ""}
      <div role="status" class="mt-3 {busy ? '' : 'text-alarm'}">{said}</div>
    {/if}
  </div>

  <div
    class="flex h-12 flex-none items-center justify-between border-t border-ink wide:ml-8"
  >
    <div class="flex gap-x-6 max-narrow:gap-x-4">
      <Action
        disabled={around.previous === undefined}
        onclick={() => walk(around.previous)}
      >
        ← previous
      </Action>
      <Action
        disabled={around.next === undefined}
        onclick={() => walk(around.next)}
      >
        next →
      </Action>
    </div>
    <button
      type="button"
      disabled={!ready || busy}
      onclick={() => void send()}
      class="inverted h-8 px-5 font-semibold disabled:bg-transparent disabled:text-inert"
    >
      route
    </button>
  </div>
</div>
