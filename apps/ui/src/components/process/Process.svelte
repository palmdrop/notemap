<script lang="ts">
  import ActionBar from "$components/primitives/blocks/ActionBar.svelte";
  import BarAction from "$components/primitives/blocks/BarAction.svelte";
  import { width } from "$lib/breakpoint";
  import { onMount, tick, untrack } from "svelte";
  import Band from "$components/primitives/blocks/Band.svelte";
  import Box from "$components/primitives/blocks/Box.svelte";
  import RadioRows from "$components/primitives/blocks/RadioRows.svelte";
  import Segmented from "$components/primitives/blocks/Segmented.svelte";
  import Icon from "$components/primitives/icon/Icon.svelte";
  import Spinner from "$components/primitives/marks/Spinner.svelte";
  import Asks from "$components/primitives/rows/Asks.svelte";
  import Facts from "$components/primitives/rows/Facts.svelte";
  import LinkRow from "$components/primitives/rows/LinkRow.svelte";
  import { itemHref } from "$components/item/href";
  import { templateFromHref } from "$components/settings/href";
  import { askForTemplate, type Step as Question } from "$lib/asked";
  import { takenAs } from "$lib/candidate-list";
  import { aboutItem } from "$lib/excerpt";
  import { headed } from "$lib/heading.svelte";
  import { within } from "$lib/within.svelte";
  import { kindIcon, templateIcon, whereOf } from "$lib/looks";
  import { notices } from "$lib/notices.svelte";
  import { keyFor } from "$lib/routing";
  import { templatable } from "$lib/template-draft";
  import {
    actionOf,
    labelFor,
    lineFor,
    wordFor,
    type Fact,
  } from "$lib/vocabulary";

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
    type RoutedRecord,
    type RoutingPreview,
    type RoutingRecord,
    type RoutingTemplate,
  } from "@notemap/client";
  import { placeOf } from "@notemap/output-markdown/naming";

  import ComposerTags from "$components/routing/ComposerTags.svelte";
  import DestinationLine from "$components/routing/DestinationLine.svelte";
  import PathLine from "$components/routing/PathLine.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import { rise, slide } from "$lib/motion";
  import Unfurls from "$components/unfurl/Unfurls.svelte";
  import AttachedLines from "$components/item/AttachedLines.svelte";
  import AttachedPictures from "$components/item/AttachedPictures.svelte";
  import Routing from "$components/item/Routing.svelte";
  import { processHref } from "$components/item/href";
  import { OWN_ARGUMENTS, sameArguments } from "$lib/arguments";
  import { folderIn, withFolder } from "$lib/output";
  import { browserFor } from "$lib/candidate-browsers";
  import { carriesAssets } from "$lib/capability";
  import { client } from "$lib/client";
  import { publish } from "$lib/command/stack.svelte";
  import { nameOf } from "$lib/destinations";
  import { search } from "$lib/matching";
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
  import { recordsOf } from "$lib/records.svelte";
  import { cancelRouting, routedHere } from "$lib/firing";
  import { firings, left, offerOf, phaseOf } from "$lib/firings.svelte";
  import { placeNamed, readingOf } from "$lib/routing";
  import { leafOf, type Said } from "$lib/forecast";
  import {
    effectiveOf,
    fieldsOf,
    givenFor,
    impliedOf,
    labelOf,
    offered,
    presetsFrom,
    valuesFrom,
  } from "$lib/schema-form";
  import { whenOf } from "$lib/when";

  import Discarding from "./Discarding.svelte";
  import Preview from "./Preview.svelte";

  /** What the typed line drives: the capability that decides at delivery. */
  const CREATE_OR_APPEND = "create-or-append";
  /** The one field the typed line drives. */
  const LINE_FIELD = "path";
  /** Where a folder mode is carried, which core writes and no adapter names. */
  const FOLDER_MODE = "folder";

  /** A keystroke in the decision waits this long before the preview is asked for again. */
  const SETTLING = 400;

  let { item }: { item: Item } = $props();

  const destinations = client.destinations.all;
  const templates = client.templates.all;
  const queue = client.queue;
  const pool = reachable();

  const offline = $derived(!pool.yes);

  /**
   * What this delivery says, from which the name of an unnamed note is
   * derived: the rewrite where there is one, the capture's own words otherwise.
   */
  const spoken = $derived<Said>({
    content: carried().content ?? item.payload.content,
    item: item.id,
  });
  /** What the capture says, which is what editing starts from and what it replaces. */
  const captured = $derived(client.says(item));
  const attachments = $derived(client.attachments(item));
  /**
   * What the item carries, read from the client's held copy rather than the
   * item this opened on: a tag taken here lands on the held copy first, and
   * the row draws it taken the moment it does.
   */
  const held = $derived(client.held(item.id));
  const tags = $derived((($held ?? item).tags ?? []).map((tag) => tag.name));
  const summary = $derived(($held ?? item).routing);

  /** Where the item has gone already, said under its stamp so a second route is made knowing the first. */
  /** Only a change of item or of the records counted asks again, not every change to the held copy. */
  const routed = $derived(
    summary === undefined
      ? undefined
      : `${item.id}:${summary.records}:${summary.pending}`,
  );
  const records = recordsOf(
    () => (routed === undefined ? undefined : item.id),
    () => !offline,
  );

  /** The route made here last, which the head offers to take back while its route is in flight. */
  let made = $state<RoutedRecord | undefined>(undefined);
  /** As the status line offers it, from the same route in flight: one that has landed is gone from both. */
  const takeable = $derived.by(() => {
    if (made === undefined) return undefined;
    const record = made;
    const flying = firings.open.find((one) => one.record === record.id);
    if (flying === undefined) return undefined;
    const landed = records.all.some(
      (one) => one.id === record.id && one.state !== "pending",
    );
    const offer = offerOf(flying, firings.now);
    return landed || offer === undefined ? undefined : { record, offer };
  });

  async function takeBack(record: RoutedRecord): Promise<void> {
    await cancelRouting(record.id, record.item);
    records.reread();
  }

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
   * Whether the form is drawn — the capability choice, the line, the fields —
   * over the read-only summary of what a taken template resolved to. A
   * destination chosen directly always wants the form; a template starts
   * read-only, since what it resolved to is already the decision.
   */
  let placing = $state(true);

  /** Places routed to before, for the line's greyed continuation and the count beside the name. */
  let places = $state<readonly RememberedPlace[]>([]);
  /** What committing the line now would do, which decides what else is asked. */
  let forecast = $state<"create" | "append" | undefined>(undefined);

  /** Why one cannot be routed to, learnt by asking it. Retirement needs no asking. */
  let refusing = $state<Record<string, string>>({});

  let shown = $state<RoutingPreview | undefined>(undefined);
  /** A preview asked for the decision as it stands, and not yet answered. */
  let previewing = $state(false);
  /** The decision the last answer belongs to, whichever way it came back. */
  let answeredFor = $state<string | undefined>(undefined);
  let previewFailed = $state("");

  /**
   * The words this one delivery carries, where a person took them from the
   * capture's. `undefined` is the ordinary case and means the item's own, and
   * so does anything equal to what the capture says: what reaches the record is
   * `carried()`'s answer rather than this.
   */
  let words = $state<string | undefined>(undefined);
  /** What the last route carried: kept for the next, they are nothing new to lose. */
  let wordsSent = $state<string | undefined>(undefined);
  let editing = $state(false);
  let typing = $state<HTMLTextAreaElement | undefined>(undefined);

  $effect(() => {
    if (editing) typing?.focus();
  });

  /** Which sections are open. `destination` and `tags` always are; the rest open on a press or when the flow reaches them. */
  let opened = $state({ place: false, preview: false });

  /**
   * What this item could be done with. A capability that carries the
   * attachments alone is left out where the item has none: there is nothing for
   * it to carry, so offering it would offer a delivery bound to be rejected —
   * and a kind whose other capability is its only one then settles that one
   * again, asking nothing. One already taken stays, a template having taken it.
   */
  const capabilities = $derived<readonly Capability[]>(
    (described?.kind === "described" ? described.capabilities : []).filter(
      (one) =>
        !carriesAssets(one) ||
        attachments.length > 0 ||
        one.name === capability,
    ),
  );

  /** What an argument left unset falls back to, where the kind says it inherits one. */
  const inherited = $derived(
    $destinations.find((one) => one.id === chosen)?.settings ?? {},
  );

  const chosenCapability = $derived(
    capabilities.find((one) => one.name === capability),
  );

  /** The capability that carries the attachments and nothing else, where the destination has one. */
  const carrier = $derived(capabilities.find(carriesAssets));
  const assetsOnly = $derived(
    chosenCapability !== undefined && carriesAssets(chosenCapability),
  );

  /**
   * The words the head draws: a rewrite is set aside while only the
   * attachments go, and comes back with `everything`.
   */
  const shownWords = $derived(assetsOnly ? captured : (words ?? captured));
  const declared = $derived(fieldsOf(chosenCapability?.argumentsSchema));
  const reading = $derived(readingOf(chosenCapability));

  /**
   * Only the fields that mean something given the others: a switch about the
   * tags is not drawn while no tags go, and whatever it held is not sent.
   */
  const fields = $derived.by(() => {
    const effective = effectiveOf(declared, args, inherited);
    return declared.filter((one) => offered(one, effective));
  });

  /**
   * Where the line is what draws the place, *what will happen* is not a step:
   * it is read off the line, and the line is what changes it. A destination
   * whose line field is no path is asked, where it has more than one to be
   * asked about.
   */
  const settles = $derived(
    capabilities.some(
      (one) =>
        one.name === CREATE_OR_APPEND &&
        fieldsOf(one.argumentsSchema).some(
          (field) => field.name === LINE_FIELD && field.path !== undefined,
        ),
    ),
  );

  /**
   * A kind that can do one thing is not offering a choice, so it is not asked
   * to be made: a step whose every path is the same step is one press spent
   * saying yes. Which is also what a board falls back to for a capture with no
   * attachment, its carrier being left out of the list above.
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

    const wanted = presetsFrom(declared);
    const held = untrack(() => args);
    const seeded = { ...wanted, ...held };
    if (Object.keys(seeded).length !== Object.keys(held).length) args = seeded;
  });

  /**
   * Only beside a capability the surface settles, which is what `everything`
   * gives back; a kind that settles nothing offers the carrier under `do`.
   */
  const offersOutput = $derived(
    carrier !== undefined &&
      implied !== undefined &&
      implied !== carrier.name &&
      (attachments.length > 0 || assetsOnly),
  );

  /** What the decision held before `attachments only` was taken, which `everything` gives back. */
  let before = $state<
    { capability: string; args: Record<string, string> } | undefined
  >(undefined);

  /**
   * Takes the carrier, or gives back what was held before it, in the folder as
   * it now stands and keeping the folder mode, and opens the place it changed.
   * A template's capability comes back as itself, not as the settled one.
   */
  function output(attachmentsOnly: boolean): void {
    if (carrier === undefined || implied === undefined) return;
    if (capability === undefined || attachmentsOnly === assetsOnly) return;
    placing = true;
    opened.place = true;
    forecast = undefined;

    const folder = folderIn(chosenCapability?.argumentsSchema, args);
    const mode = args[FOLDER_MODE];
    const carried = (
      schema: Record<string, unknown> | undefined,
      held: Record<string, string>,
    ) => {
      const placed = withFolder(schema, held, folder);
      const takesMode = fieldsOf(schema).some(
        (one) => one.name === FOLDER_MODE,
      );
      return mode === undefined || !takesMode
        ? placed
        : { ...placed, [FOLDER_MODE]: mode };
    };

    if (attachmentsOnly) {
      before = { capability, args };
      capability = carrier.name;
      args = carried(carrier.argumentsSchema, {});
      return;
    }

    const back = before ?? { capability: implied, args: {} };
    before = undefined;
    capability = back.capability;
    args = carried(
      capabilities.find((one) => one.name === back.capability)?.argumentsSchema,
      back.args,
    );
  }

  /** Nothing to pick among is nothing to draw: the line and the fields are the whole decision. */
  const chooses = $derived(capabilities.length > 1 && implied === undefined);

  /** What a taken template asks for each time, by field. */
  const asking = $derived(applied?.asked ?? {});
  /** The fields it asks for, drawn open while the rest of what it resolved to is read-only. */
  const askedFields = $derived(fields.filter((one) => one.name in asking));
  /** Every asked field holds a value, given or the default it resolved with. */
  const askedSettled = $derived(
    askedFields.every((one) => (args[one.name] ?? "").trim() !== ""),
  );

  /** The arguments without what the template asks, which are the only ones taking it may change. */
  function fixedOf(
    values: Readonly<Record<string, unknown>>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(values).filter(([name]) => !(name in asking)),
    );
  }

  /**
   * On a phone the steps come one at a time: where, then a template's
   * questions, or how and the place where a template does not fix them, then
   * the check. When wide every step is on the one surface.
   */
  type StepName = "where" | "how" | "place" | "check" | `ask:${string}`;
  const PICK_FIRST = "Pick a destination, and where in it, to route.";
  const NOTHING_PICKED = "Pick a template or a destination first.";

  /** A choice of a few that shapes what is written, rather than where. */
  const isHow = (one: (typeof fields)[number]): boolean =>
    one.options !== undefined &&
    !one.listable &&
    one.path === undefined &&
    !OWN_ARGUMENTS.includes(one.name) &&
    !(one.name in asking);
  const howFields = $derived(placing ? fields.filter(isHow) : []);
  const hasHow = $derived(
    placing && (offersOutput || chooses || howFields.length > 0),
  );

  /** A template's place stands until it is changed for one route. */
  const templated = $derived(applied !== undefined && !placing);

  const stepped = $derived.by((): readonly StepName[] => {
    if (templated) {
      return [
        "where",
        ...askedFields.map((one): StepName => `ask:${one.name}`),
        "check",
      ];
    }
    if (chosen === undefined) return ["where", "how", "place", "check"];
    return ["where", ...(hasHow ? (["how"] as const) : []), "place", "check"];
  });
  let stepAt = $state(0);
  $effect(() => {
    if (stepAt > stepped.length - 1) stepAt = stepped.length - 1;
  });
  const step = $derived(stepped[Math.min(stepAt, stepped.length - 1)]);
  const onPhone = $derived(!width.wide);
  const shows = (name: StepName): boolean => !onPhone || step === name;

  const STEP_WORDS: Record<string, string> = {
    where: "where",
    how: "how",
    place: "place",
    check: "check",
  };
  const stepWord = $derived(
    step === undefined ? "" : (STEP_WORDS[step] ?? "question"),
  );

  /** Goes to a step: on a phone it takes the screen, when wide it is scrolled to. */
  async function goTo(name: StepName): Promise<void> {
    await tick();
    const at = stepped.indexOf(name);
    if (onPhone) {
      if (at !== -1) stepAt = at;
      return;
    }
    document
      .getElementById(`step-${name}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /** A place a template fixed, changed for this one route, which then goes by hand. */
  async function unpin(): Promise<void> {
    placing = true;
    opened.place = true;
    await goTo("place");
  }

  // A destination or a template picked is the where answered: on to the next.
  let pickedBefore: string | undefined;
  $effect(() => {
    const now = chosen ?? applied?.id;
    if (now !== undefined && now !== pickedBefore && step === "where") {
      stepAt = Math.min(1, stepped.length - 1);
    }
    pickedBefore = now;
  });

  /**
   * What the template asks, as questions with their answers: a closed list,
   * what the destination holds, or a typed answer.
   */
  let questions = $state<readonly Question[]>([]);
  let answers = $state<Record<string, readonly string[] | undefined>>({});
  let typedAnswer = $state<Record<string, string>>({});

  $effect(() => {
    const template = applied;
    questions = [];
    answers = {};
    if (template === undefined) return;
    void askForTemplate(template).then((asking) => {
      if (applied?.id === template.id) questions = asking?.steps ?? [];
    });
  });

  $effect(() => {
    for (const question of questions) {
      if (question.field in answers) continue;
      if (question.closed !== undefined) {
        answers = { ...answers, [question.field]: question.closed };
      } else if (question.listed === undefined) {
        answers = { ...answers, [question.field]: [] };
      } else {
        answers = { ...answers, [question.field]: undefined };
        const field = question.field;
        void question
          .listed(untrack(() => $state.snapshot(args)))
          .then((entries) => {
            answers = {
              ...answers,
              [field]: entries.map((entry) => takenAs(entry)),
            };
          })
          .catch(() => (answers = { ...answers, [field]: [] }));
      }
    }
  });

  /** An answer taken: on a phone it moves on, when wide it is picked and stays. */
  function answer(field: string, value: string): void {
    args = { ...args, [field]: value };
    if (onPhone) stepAt = Math.min(stepAt + 1, stepped.length - 1);
  }

  /** Why Route cannot be pressed yet, said over the bar. */
  const WHY_NOT = $derived.by(() => {
    const unanswered = askedFields.find(
      (one) => (args[one.name] ?? "").trim() === "",
    );
    if (unanswered !== undefined) {
      const label = asking[unanswered.name]?.label ?? labelFor(unanswered);
      return `Answer “${label}” to route.`;
    }
    return PICK_FIRST;
  });

  const ready = $derived(
    chosen !== undefined && capability !== undefined && askedSettled,
  );

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

  /** Notemap's own folder mode, asked only where the place is a new note in a folder. */
  const folderMode = $derived(
    lined &&
      forecast === "create" &&
      placeOf(args[LINE_FIELD] ?? "").directory !== ""
      ? fields.find((one) => OWN_ARGUMENTS.includes(one.name))
      : undefined,
  );

  /** What the place step asks beside the line, or every field where there is no line. */
  const placeFields = $derived(
    (lined ? beside : fields).filter(
      (one) => !isHow(one) && !OWN_ARGUMENTS.includes(one.name),
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
      : placeNamed(valuesFrom(fields, args), undefined, reading);

    return path === undefined ? undefined : `${nameOf(chosen)} / ${path}`;
  });

  function placeFor(value: string): string {
    const { directory } = placeOf(value);
    const filename = leafOf(value, spoken);
    return directory === "" ? filename : `${directory}/${filename}`;
  }

  /** A wrong choice is not a reason to leave the surface. */
  function release(): void {
    routedNow = undefined;
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
    previewing = false;
    answeredFor = undefined;
    placing = true;
    before = undefined;
    stepAt = 0;
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

  /**
   * From the keystroke rather than the request: the settling wait is a wait
   * on the preview too, and what is up meanwhile answers a decision that no
   * longer stands.
   */
  const pending = $derived(
    ready && settledArguments && (previewing || answeredFor !== decision),
  );

  async function show() {
    if (chosen === undefined || capability === undefined) return;

    // The answer belongs to the decision it was asked with. One that resolves
    // after the person has moved on is dropped rather than drawn under
    // arguments it knows nothing about.
    const asked = decision;
    previewing = true;
    try {
      const answer = await client.routing.preview(item.id, {
        destination: chosen,
        capability,
        arguments: valuesFrom(fields, args),
        ...carried(),
      });
      if (asked === decision) {
        answeredFor = asked;
        shown = answer;
        previewFailed = "";
        opened.preview = true;
      }
    } catch (error) {
      if (asked === decision) {
        answeredFor = asked;
        previewFailed = saidBy(error);
        opened.preview = true;
      }
    } finally {
      if (asked === decision) previewing = false;
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
    return {
      lead: `${routed} routed`,
      rest: last === undefined ? undefined : `last ${whenOf(last, now)}`,
    };
  });

  /**
   * An untouched decision commits as the template, so the record names it and
   * an `establish` template learns that its folder is there. Corrected, it is a
   * decision of the person's own and goes as one — the template was where it
   * started, not what it stayed.
   */
  function requestFor() {
    const wanted = valuesFrom(fields, args);
    const untouched =
      applied !== undefined &&
      resolved !== undefined &&
      capability === resolved.capability &&
      sameArguments(fixedOf(wanted), fixedOf(offeredOf(resolved.arguments)));

    if (untouched) {
      const given = Object.fromEntries(
        Object.entries(wanted).filter(
          (entry): entry is [string, string] =>
            entry[0] in asking && typeof entry[1] === "string",
        ),
      );
      return {
        template: (applied as RoutingTemplate).id,
        ...(Object.keys(given).length === 0 ? {} : { arguments: given }),
        ...carried(),
      };
    }

    return {
      destination: chosen as string,
      capability: capability as string,
      arguments: wanted,
      ...carried(),
    };
  }

  /**
   * A template may hold a value for a field the form is not offering — the
   * destination's settings moved since it was saved, or it was written over
   * the wire. The form sends nothing for it, so comparing against the whole
   * would call every such template touched and commit it as the person's own.
   */
  function offeredOf(
    held: Readonly<Record<string, unknown>>,
  ): Record<string, unknown> {
    const names = new Set(fields.map((one) => one.name));
    return Object.fromEntries(
      Object.entries(held).filter(([name]) => names.has(name)),
    );
  }

  /**
   * What this delivery says, where it is not what the item says. Words nobody
   * changed carry nothing: the presence of `content` on the record is the fact
   * that a person rewrote it, so opening the field and typing nothing must not
   * leave a record claiming a rewrite that never happened. Only the payload's
   * content is replaced, so the assets stay the capture's.
   */
  function carried(): { content?: Record<string, unknown> } {
    return assetsOnly || words === undefined || words === captured
      ? {}
      : { content: saidAs(item.payload, words).content };
  }

  /**
   * Opens the capture's words for typing. They are this delivery's alone: the
   * item is never changed, and wanting the fix everywhere is wanting `edit` on
   * the row.
   */
  function edit(): void {
    if (assetsOnly) return;
    words ??= captured;
    editing = true;
    if (onPhone) void goTo("check");
  }

  function done(): void {
    editing = false;
  }

  /** The way back: this delivery carries the capture's words after all. */
  function keep(): void {
    words = undefined;
    editing = false;
  }

  function reasonFor(id: string): string | undefined {
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
      all[one.id] = reasonFor(one.id);
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
    if (destination.retired === true) return "its destination is disabled";
    if (offline) return "pool out of reach";
    return refusing[one.id];
  }

  /** The three bands, narrowed together by what the line holds. */
  const byName = <T extends { readonly name: string }>(list: readonly T[]) =>
    search(list, typed, (one) => [one.name]);

  const templatesShown = $derived(byName($templates));
  /** A disabled destination is not somewhere to route to, and is not offered as one. */
  const offeredDestinations = $derived(
    $destinations.filter((one) => one.retired !== true),
  );
  const destinationsShown = $derived(byName(offeredDestinations));
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
      // What it resolved to is already the decision: the form stays behind
      // `edit` until somebody asks to correct it. A destination that could not
      // describe itself has said so on its own line, and leaves nothing applied.
      if (chosen !== undefined) {
        placing = false;
      } else {
        applied = undefined;
        resolved = undefined;
      }
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
      await advance();
      return;
    }

    if (id === MANUAL) {
      await manual(item);
      await advance();
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

  async function send() {
    if (chosen === undefined || capability === undefined || busy) return;

    busy = true;
    said = "";
    try {
      const record = await client.routing.route(item.id, requestFor());
      classify(record);
      made = record;
      routedHere(record, reading);
      const after = {
        record,
        to: nameOf(chosen),
        facts: checkFacts.map(({ label, value }) => ({ label, value })),
      };
      // The surface stays, cleared: an item may go to more than one place,
      // and Next item is what moves on.
      release();
      routedNow = after;
      wordsSent = words;
      records.reread();
    } catch (error) {
      said = saidBy(error);
    } finally {
      busy = false;
    }
  }

  /**
   * The check: every fact of the decision, each opening the step that set it.
   * A place the template fixed says so and is changed for this route alone.
   */
  const checkFacts = $derived.by((): Fact[] => {
    if (chosen === undefined) return [];
    const values = valuesFrom(fields, args);
    const facts: Fact[] = [
      {
        label: "destination",
        value: nameOf(chosen),
        open: () => void goTo("where"),
      },
    ];
    if (templated && applied !== undefined) {
      facts.push({
        label: "template",
        value: applied.name,
        open: () => void goTo("where"),
      });
    }
    if (capability !== undefined) {
      facts.push({
        label: "action",
        value: actionOf(capability, forecast),
        ...(hasHow ? { open: () => void goTo("how") } : {}),
      });
    }
    for (const field of fields) {
      const held =
        field.name === LINE_FIELD && lined
          ? (values[field.name] ?? "")
          : values[field.name];
      if (held === undefined || held === null) continue;
      if (held === "" && !(field.name === LINE_FIELD && lined)) continue;
      const raw = typeof held === "string" ? held : JSON.stringify(held);
      const value =
        field.name === LINE_FIELD && lined
          ? placeFor(raw)
          : wordFor(field.name, raw);
      const label = labelFor(field);
      if (templated && applied !== undefined) {
        if (field.name in asking) {
          facts.push({
            label,
            value,
            open: () => void goTo(`ask:${field.name}`),
          });
        } else if (isHow(field) || OWN_ARGUMENTS.includes(field.name)) {
          facts.push({ label, value });
        } else {
          facts.push({
            label,
            value,
            line: `set by ${applied.name}; change it for this route`,
            open: () => void unpin(),
            opens: `Change ${label} for this route`,
          });
        }
        continue;
      }
      if (OWN_ARGUMENTS.includes(field.name) && lined && !folderMode) continue;
      facts.push({
        label,
        value,
        open: () => void goTo(isHow(field) ? "how" : "place"),
      });
    }
    return facts;
  });

  /**
   * The route just made, drawn in the check's place: what it holds, where it
   * stands, and what to do next. Replaced by the next decision.
   */
  let routedNow = $state<
    { record: RoutedRecord; to: string; facts: readonly Fact[] } | undefined
  >(undefined);

  /** Where the route just made stands: in its window, sent, landed, or turned down. */
  const routedState = $derived.by(() => {
    if (routedNow === undefined) return undefined;
    const { record, to } = routedNow;
    const landed = records.all.find((one) => one.id === record.id);
    if (landed?.state === "delivered") {
      return { tone: "good" as const, said: `Delivered to ${to}` };
    }
    const turned = notices.history.find(
      (one) => one.key === keyFor(record.id) && one.alarm === true,
    );
    if (turned !== undefined) {
      return { tone: "danger" as const, said: turned.what };
    }
    const flying = firings.open.find((one) => one.record === record.id);
    if (flying === undefined) {
      return { tone: "plain" as const, said: `Sending to ${to}` };
    }
    const phase = phaseOf(flying, firings.now);
    const seconds = left(flying, firings.now);
    return {
      tone: "under" as const,
      said:
        phase === "window"
          ? `Routing to ${to}${seconds === undefined ? "" : `, ${String(seconds)}s to cancel`}`
          : phase === "sending"
            ? `Sending to ${to}`
            : `Waiting for ${to}`,
    };
  });

  /** Only a route made by hand is worth saving as one. */
  const savable = $derived(
    routedNow !== undefined &&
      routedNow.record.applied === undefined &&
      templatable(routedNow.record, $destinations),
  );

  headed(() => ({
    title: routedNow === undefined ? "route" : "routed",
    out: { icon: "close", label: "Close", run: leave },
    ...(onPhone && routedNow === undefined
      ? {
          aside: `${stepWord}  ${String(stepAt + 1)} of ${String(stepped.length)}`,
        }
      : {}),
    ...(onPhone ? { under: aboutItem(item) } : {}),
  }));

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
   * The row after this item as the queue stands now, whether or not the item
   * is still on it: past the row it stood behind, or from the top where it
   * was first or was never on the queue at all.
   */
  function following(): Item | undefined {
    const rows = $queue.items;
    const at = rows.findIndex((one) => one.id === item.id);
    if (at !== -1) return rows[at + 1];

    const before = around.previous;
    const from =
      before === undefined
        ? 0
        : rows.findIndex((one) => one.id === before.id) + 1;
    return rows[from];
  }

  /**
   * After manual, discard or a template tag the surface moves on to the next
   * unprocessed item, and returns to the queue when there is none. That is
   * what a queue worked from one end is. The queue is read a page at a time,
   * so the end of what is held is not the end of the queue until it says so.
   */
  async function advance(): Promise<void> {
    let next = around.next;
    if (next === undefined && $queue.more) {
      await client.loadQueue().catch(() => undefined);
      next = following();
    }
    next ??= following();
    await goto(next === undefined ? resolve("/") : processHref(next.id), {
      replaceState: true,
    });
  }

  /**
   * Whether something has been chosen or written since the surface opened or
   * last routed. The item's tags are not part of it: a tag is applied to the
   * pool when taken.
   */
  const entered = $derived(
    chosen !== undefined ||
      applied !== undefined ||
      (words !== undefined && words !== captured && words !== wordsSent),
  );
  let confirming = $state(false);

  /**
   * Back to where the route began. Opened at its address, there is nowhere
   * before it, and the queue takes its place.
   */
  function back(): void {
    if (within.yes) history.back();
    else void goto(resolve("/"), { replaceState: true });
  }

  function leave(): void {
    if (entered) confirming = true;
    else back();
  }

  function walk(to: Item | undefined): void {
    if (to !== undefined) void goto(processHref(to.id));
  }

  // Routing is the one command that fires with the caret in a field: the
  // decision is finished there, and reaching for the mouse to send it is the
  // gesture this surface exists to spare.
  publish(() => [
    {
      id: "route",
      label: "route",
      whileWriting: true,
      refusal: ready
        ? undefined
        : askedSettled
          ? "nowhere to send it"
          : "the template asks for something",
      run: () => void send(),
    },
    {
      id: "edit",
      label: "edit",
      refusal: assetsOnly ? "only the attachments go" : undefined,
      run: edit,
    },
    { id: "back", label: "back", run: () => (editing ? done() : leave()) },
    {
      id: "previous",
      label: "previous item",
      refusal: around.previous === undefined ? "first in the queue" : undefined,
      run: () => walk(around.previous),
    },
    {
      id: "next",
      label: "next item",
      refusal: around.next === undefined ? "last in the queue" : undefined,
      run: () => walk(around.next),
    },
  ]);
</script>

{#if confirming}
  <Discarding
    onanswer={(leaving) => {
      confirming = false;
      if (leaving) back();
    }}
  />
{/if}

{#snippet control(field: (typeof fields)[number])}
  {@const title = labelFor(field)}
  {#if field.listable && chosen !== undefined && capability !== undefined}
    {@const Browser = browserFor(field)}
    <div class="border-b border-rule px-gutter py-3">
      <Browser
        destination={chosen}
        {capability}
        field={field.name}
        label={title}
        value={args[field.name] ?? ""}
        said={field.name === LINE_FIELD ? spoken : undefined}
        given={givenFor(field, args)}
        offeredOnly={field.offeredOnly}
        onchange={(value) => (args = { ...args, [field.name]: value })}
        onrelease={release}
      />
    </div>
  {:else if field.options !== undefined}
    <!-- A long choice is rows; one left unset is drawn as what it comes out as. -->
    {@const implied =
      (args[field.name] ?? "") === "" ? impliedOf(field, inherited) : undefined}
    <Band level={3}>{title}</Band>
    <RadioRows
      label={title}
      value={(args[field.name] ?? "") === "" ? implied : args[field.name]}
      options={field.options.map((one) => ({
        value: one,
        word: wordFor(field.name, labelOf(field, one)),
        ...(lineFor(field.name, one) === undefined
          ? {}
          : { line: lineFor(field.name, one) }),
      }))}
      onchoose={(one) => (args = { ...args, [field.name]: one })}
    />
  {:else}
    <label class="block border-b border-rule px-gutter py-3">
      <span class="mb-1.5 block text-small">{title}</span>
      <input
        bind:value={args[field.name]}
        placeholder={field.required ? "required" : "optional"}
        aria-label={title}
        class="min-h-11 w-full rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
      />
    </label>
  {/if}
{/snippet}

{#snippet stepHead(name: string)}
  {#if !onPhone}
    <h2
      class="m-0 border-b border-rule px-gutter pt-5 pb-3 font-display text-title font-normal lowercase"
    >
      {name}
    </h2>
  {/if}
{/snippet}

{#snippet waiting()}
  <p class="m-0 px-gutter py-3 text-muted">{NOTHING_PICKED}</p>
{/snippet}

{#snippet where()}
  <section
    id="step-where"
    data-step="where"
    aria-label="where"
    class={shows("where") ? "" : "hidden"}
  >
    {@render stepHead("where")}
    {#if chosen === undefined && applied === undefined}
      <div class="border-b border-rule px-gutter py-3">
        <DestinationLine
          destinations={[...$templates, ...offeredDestinations, ...HAND]}
          {unusable}
          focus={!onPhone}
          ontake={(id) => void taken(id)}
          ontyped={(text) => (typed = text)}
        />
      </div>

      <div id="destination-bands">
        {#if templatesShown.length > 0}
          <Band>templates</Band>
          {#each templatesShown as one (one.id)}
            <LinkRow
              icon={templateIcon(
                one,
                $destinations.find((each) => each.id === one.destination)?.kind,
              )}
              title={one.name}
              label={one.name}
              line={whereOf(one)}
              why={unusable[one.id]}
              strong={hit === one.id}
              onclick={() => void take(one)}
            >
              {#snippet badge()}
                {#if Object.keys(one.asked ?? {}).length > 0}<Asks />{/if}
              {/snippet}
            </LinkRow>
          {/each}
        {/if}

        {#if destinationsShown.length > 0}
          <Band>destinations</Band>
          {#each destinationsShown as one (one.id)}
            <LinkRow
              icon={kindIcon(one.kind)}
              title={one.name}
              label={one.name}
              why={unusable[one.id]}
              strong={hit === one.id}
              onclick={() => void choose(one.id)}
            />
          {/each}
        {/if}

        <!-- What the shell invents: `manual` is a destination the pool records
             and never lists, `discard` is not a destination at all. -->
        {#if handShown.length > 0 && onPhone}
          <Band>other</Band>
          {#each handShown as one (one.id)}
            <LinkRow
              icon={one.id === DISCARD ? "trash" : "check"}
              title={one.id === DISCARD ? "Discard" : "Done"}
              label={one.id === DISCARD ? "Discard" : "Done"}
              line={one.id === MANUAL ? "Manual: processed by hand" : undefined}
              danger={one.id === DISCARD}
              chevron={false}
              why={unusable[one.id]}
              strong={hit === one.id}
              onclick={() => void choose(one.id)}
            />
          {/each}
        {/if}
      </div>
    {:else}
      {@const template = applied}
      <div
        in:slide
        class="grid min-h-bar grid-cols-[var(--spacing-icon)_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule px-gutter py-2.5"
      >
        <Icon
          name={template === undefined
            ? kindIcon($destinations.find((each) => each.id === chosen)?.kind)
            : templateIcon(
                template,
                $destinations.find((each) => each.id === template.destination)
                  ?.kind,
              )}
        />
        <span class="min-w-0">
          <span class="block font-semibold">
            {template?.name ?? (chosen === undefined ? "" : nameOf(chosen))}
          </span>
          <small class="block truncate text-small text-muted">
            {#if template !== undefined}
              template: {whereOf(template)}
            {:else}
              destination{#if usedBefore !== undefined},
                {usedBefore.lead}{#if usedBefore.rest !== undefined},
                  {usedBefore.rest}{/if}{/if}
            {/if}
          </small>
        </span>
        <button
          type="button"
          aria-label="change"
          onclick={release}
          class="min-h-target px-1 underline underline-offset-[0.2em]"
        >
          Change
        </button>
      </div>
      {#if chosen === undefined}
        <div class="px-gutter py-3"><Asking /></div>
      {/if}
    {/if}
  </section>
{/snippet}

{#snippet questionsOf()}
  {#each askedFields as field (field.name)}
    {@const question = questions.find((one) => one.field === field.name)}
    {@const offered = answers[field.name]}
    {@const title = asking[field.name]?.label ?? labelFor(field)}
    <section
      id="step-ask:{field.name}"
      data-step="ask"
      class={shows(`ask:${field.name}`) ? "" : "hidden"}
    >
      <Band>{title}</Band>
      {#if question === undefined || offered === undefined}
        <div class="px-gutter py-3"><Asking /></div>
      {:else}
        {#if onPhone}
          {#each offered as value (value)}
            <LinkRow
              title={value}
              label={value}
              strong={args[field.name] === value}
              onclick={() => answer(field.name, value)}
            />
          {/each}
        {:else if offered.length > 0}
          <RadioRows
            label={title}
            value={args[field.name]}
            options={offered.map((value) => ({ value, word: value }))}
            onchoose={(value) => answer(field.name, value)}
          />
        {/if}
        {#if question.closed === undefined}
          <form
            class="flex items-center gap-2 border-b border-rule px-gutter py-3"
            onsubmit={(event) => {
              event.preventDefault();
              const said = (typedAnswer[field.name] ?? "").trim();
              if (said !== "") answer(field.name, said);
            }}
          >
            <input
              value={typedAnswer[field.name] ?? ""}
              oninput={(event) => {
                const typedNow = event.currentTarget.value;
                typedAnswer = { ...typedAnswer, [field.name]: typedNow };
                args = { ...args, [field.name]: typedNow.trim() };
              }}
              {@attach (input) => {
                if (!onPhone && field.name === askedFields[0]?.name)
                  input.focus();
              }}
              aria-label={title}
              placeholder={offered.length === 0 ? title : `Another ${title}`}
              class="min-h-11 min-w-0 flex-1 rounded-control border border-edge bg-paper px-3 outline-none focus:border-ink"
            />
          </form>
        {/if}
      {/if}
    </section>
  {/each}
{/snippet}

{#snippet how()}
  {#if hasHow || (!onPhone && !templated && chosen === undefined)}
    <section
      id="step-how"
      data-step="how"
      aria-label="how"
      class={shows("how") ? "" : "hidden"}
    >
      {@render stepHead("how")}
      {#if chosen === undefined}
        {@render waiting()}
      {:else}
        {#if offersOutput}
          <div class="border-b border-rule px-gutter py-3">
            <span class="mb-2 block font-display text-weekday lowercase"
              >output</span
            >
            <Segmented
              label="output"
              value={assetsOnly ? "assets" : "everything"}
              options={[
                { value: "everything", word: "Everything" },
                { value: "assets", word: "Attachments only" },
              ]}
              onchoose={(one) => output(one === "assets")}
            />
          </div>
        {/if}
        {#if chooses}
          <div class="border-b border-rule px-gutter py-3">
            <span class="mb-2 block font-display text-weekday lowercase"
              >action</span
            >
            <Segmented
              label="action"
              value={capability}
              options={capabilities.map((one) => ({
                value: one.name,
                word: actionOf(one.name),
              }))}
              onchoose={(one) => {
                capability = one;
                args = {};
              }}
            />
          </div>
        {/if}
        {#each howFields as field (field.name)}
          {@const implied =
            (args[field.name] ?? "") === ""
              ? impliedOf(field, inherited)
              : undefined}
          <div class="border-b border-rule px-gutter py-3">
            <span class="mb-2 block font-display text-weekday lowercase"
              >{labelFor(field)}</span
            >
            <Segmented
              label={labelFor(field)}
              value={(args[field.name] ?? "") === ""
                ? implied
                : args[field.name]}
              options={(field.options ?? []).map((one) => ({
                value: one,
                word: wordFor(field.name, labelOf(field, one)),
              }))}
              onchoose={(one) => (args = { ...args, [field.name]: one })}
            />
          </div>
        {/each}
      {/if}
    </section>
  {/if}
{/snippet}

{#snippet place()}
  <section
    id="step-place"
    data-step="place"
    aria-label="place"
    class={shows("place") ? "" : "hidden"}
  >
    {@render stepHead("place")}
    {#if chosen === undefined}
      {@render waiting()}
    {:else if described === undefined}
      <div class="px-gutter py-3"><Asking subject={nameOf(chosen)} /></div>
    {:else if lined && line !== undefined && capability !== undefined}
      <div class="border-b border-rule px-gutter py-3">
        <PathLine
          destination={chosen}
          {capability}
          field={line.name}
          label={labelFor(line)}
          placeholder={`Find a folder in ${nameOf(chosen)}`}
          value={args[line.name] ?? ""}
          said={spoken}
          {places}
          onchange={(value) => (args = { ...args, [line.name]: value })}
          onrelease={release}
          onforecast={(word) => (forecast = word)}
        />
      </div>
      {#each placeFields as field (field.name)}
        {@render control(field)}
      {/each}
      {#if folderMode !== undefined}
        {@const mode = folderMode}
        {@const implied =
          (args[mode.name] ?? "") === ""
            ? impliedOf(mode, inherited)
            : undefined}
        <Band level={3}>if the folder is missing</Band>
        <RadioRows
          label="if the folder is missing"
          value={(args[mode.name] ?? "") === "" ? implied : args[mode.name]}
          options={(mode.options ?? []).map((one) => ({
            value: one,
            word: wordFor(mode.name, one),
            ...(lineFor(mode.name, one) === undefined
              ? {}
              : { line: lineFor(mode.name, one) }),
          }))}
          onchoose={(one) => (args = { ...args, [mode.name]: one })}
        />
      {/if}
    {:else}
      {#each placeFields as field (field.name)}
        {@render control(field)}
      {/each}
    {/if}
  </section>
{/snippet}

{#snippet check()}
  <section
    id="step-check"
    data-step="check"
    aria-label="check"
    class={shows("check") ? "" : "hidden"}
  >
    {@render stepHead("check")}
    {#if chosen === undefined && !onPhone}
      {@render waiting()}
    {:else}
      <Facts facts={checkFacts} />
    {/if}

    <Band>tags</Band>
    <div class="px-gutter py-3">
      <ComposerTags
        item={item.id}
        names={tags}
        templates={summary?.templates ?? []}
        ontemplate={(template) => void take(template)}
      />
      <p class="mt-2 mb-0 text-small text-muted">
        The item's own tags: a change here is a change to the item.
      </p>
    </div>

    <Band>as it will be written</Band>
    <div class="px-gutter py-3">
      {#if shown !== undefined || pending}
        <Preview
          {shown}
          place={previewPlace}
          {attachments}
          asking={pending}
          subject={chosen === undefined ? undefined : nameOf(chosen)}
        />
      {:else if previewFailed !== ""}
        <p role="status" class="m-0 text-danger">{previewFailed}</p>
      {:else}
        <p class="m-0 text-muted">
          {chosen === undefined
            ? NOTHING_PICKED
            : "Shown once the place is settled."}
        </p>
      {/if}
      {#if editing && !assetsOnly}
        <textarea
          bind:this={typing}
          bind:value={words}
          aria-label="words"
          rows="6"
          class="mt-3 w-full resize-y rounded-control border border-edge bg-paper px-3 py-2.5 outline-none focus:border-ink"
        ></textarea>
        <div class="mt-2 flex gap-2">
          <Box icon="undo" onclick={keep}>Restore</Box>
          <Box icon="check" onclick={done}>Use these words</Box>
        </div>
      {:else if !assetsOnly}
        <div class="mt-2">
          <Box
            icon="edit"
            title="Edit the words this route carries"
            onclick={edit}>Edit</Box
          >
        </div>
      {/if}
    </div>

    {#if said !== ""}
      <p role="status" class="m-0 px-gutter py-3 text-danger">{said}</p>
    {/if}
  </section>
{/snippet}

{#snippet routedView(routed: NonNullable<typeof routedNow>)}
  <div in:rise>
    <Facts facts={routed.facts} />
    {#if routedState !== undefined}
      <div
        role="status"
        class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-rule px-gutter py-3 {routedState.tone ===
        'good'
          ? 'bg-signal'
          : 'bg-tag'}"
      >
        <span class="text-small">state</span>
        <span
          class="flex min-w-0 items-center gap-2 {routedState.tone === 'danger'
            ? 'text-danger'
            : ''}"
        >
          {#if routedState.tone === "under"}<Spinner />{/if}
          {routedState.said}
        </span>
      </div>
    {/if}
    <Band>and then</Band>
    <LinkRow
      icon="route"
      title="Route it somewhere else too"
      onclick={() => {
        routedNow = undefined;
        stepAt = 0;
      }}
    />
    {#if savable}
      <LinkRow
        icon="template"
        title="Save this as a template"
        href={templateFromHref(item.id, routed.record.id)}
      />
    {/if}
    <LinkRow icon="file" title="Open the item" href={itemHref(item.id)} />
  </div>
{/snippet}

<div
  in:rise
  class="flex min-h-0 w-full flex-1 flex-col wide:grid wide:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
>
  {#if !onPhone}
    <!-- The item, whole, beside every step. -->
    <section
      aria-label="item"
      class="flex min-h-0 flex-col overflow-auto border-r border-rule"
    >
      <div class="px-gutter py-5">
        <div class="mb-2 text-small text-muted">
          <Stamp at={item.createdAt} inline />
        </div>

        {#if summary !== undefined}
          <div class="mb-2 flex min-w-0 items-baseline gap-x-4">
            <div class="min-w-0">
              <Routing {summary} records={records.all} short />
            </div>
            {#if takeable !== undefined}
              {@const { record, offer } = takeable}
              <button
                type="button"
                class="shrink-0 underline underline-offset-[0.2em]"
                onclick={() => void takeBack(record)}>{offer}</button
              >
            {/if}
          </div>
        {/if}

        <AttachedPictures {attachments} picture="max-h-64" />
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="max-w-prose break-words whitespace-pre-wrap"
          ondblclick={edit}
        >
          {shownWords}
        </div>
        <AttachedLines {attachments} ruled={shownWords !== ""} />
        <Unfurls text={shownWords} />
      </div>
      <!-- Discard and Done at the foot of the item, level with Route at
           the foot of the steps. -->
      <div class="mt-auto">
        {#if routedNow === undefined}
          <ActionBar at="foot" label="Item">
            <BarAction
              icon="trash"
              label="Discard"
              danger
              why={unusable[DISCARD]}
              onclick={() => void choose(DISCARD)}
            />
            <BarAction
              icon="check"
              label="Done"
              why={unusable[MANUAL]}
              onclick={() => void choose(MANUAL)}
            />
          </ActionBar>
        {/if}
      </div>
    </section>
  {/if}

  <section aria-label="steps" class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-auto">
      {#if routedNow !== undefined}
        {@render routedView(routedNow)}
      {:else}
        {#key onPhone ? step : "all"}
          <div in:rise>
            {@render where()}
            {#if templated}
              {@render questionsOf()}
            {:else}
              {@render how()}
              {@render place()}
            {/if}
            {@render check()}
          </div>
        {/key}
      {/if}
    </div>

    <div class="flex-none">
      {#if routedNow !== undefined}
        <ActionBar at="foot" label="Routed">
          {#if takeable !== undefined}
            {@const { record } = takeable}
            <BarAction
              icon="close"
              label="Cancel"
              onclick={() => void takeBack(record)}
            />
          {/if}
          <BarAction
            icon="next"
            label="Next item"
            primary
            command="next"
            onclick={() => void advance()}
          />
        </ActionBar>
      {:else if onPhone}
        <ActionBar at="foot" label="Route">
          {#snippet say()}{#if step === "check" && !ready && !busy}{WHY_NOT}{/if}{/snippet}
          <BarAction
            icon="back"
            label="Back"
            disabled={stepAt === 0}
            onclick={() => (stepAt = Math.max(0, stepAt - 1))}
          />
          {#if step === "check"}
            <BarAction
              icon="route"
              label="Route"
              primary
              working={busy}
              why={!ready && !busy ? WHY_NOT : undefined}
              command="route"
              onclick={() => void send()}
            />
          {:else if step === "how" || step === "place" || (step?.startsWith("ask:") === true && (typedAnswer[step.slice(4)] ?? "").trim() !== "")}
            <BarAction
              icon="next"
              label="Next"
              primary
              disabled={chosen === undefined}
              onclick={() => {
                if (step?.startsWith("ask:") === true) {
                  const field = step.slice(4);
                  answer(field, (typedAnswer[field] ?? "").trim());
                  return;
                }
                stepAt = Math.min(stepped.length - 1, stepAt + 1);
              }}
            />
          {/if}
        </ActionBar>
      {:else}
        <ActionBar at="foot" label="Route">
          {#snippet say()}{#if !ready && !busy}{WHY_NOT}{/if}{/snippet}
          <BarAction
            icon="route"
            label="Route"
            primary
            working={busy}
            why={!ready && !busy ? WHY_NOT : undefined}
            command="route"
            onclick={() => void send()}
          />
        </ActionBar>
      {/if}
    </div>
  </section>
</div>
