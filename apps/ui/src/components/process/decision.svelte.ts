import { untrack } from "svelte";
import { observed } from "$lib/observed.svelte";

import {
  saidAs,
  type Capability,
  type DestinationDescription,
  type Item,
  type RememberedPlace,
  type ResolvedRoutingTemplate,
  type RoutingTemplate,
} from "@notemap/client";
import { placeOf } from "@notemap/output-markdown/naming";

import { OWN_ARGUMENTS, sameArguments } from "$lib/arguments";
import { carriesAssets } from "$lib/capability";
import { client } from "$lib/client";
import { nameOf } from "$lib/destinations";
import { leafOf, type Said } from "$lib/forecast";
import { folderIn, withFolder } from "$lib/output";
import { placeNamed, readingOf } from "$lib/routing";
import {
  effectiveOf,
  fieldsOf,
  offered,
  presetsFrom,
  valuesFrom,
  type Field,
} from "$lib/schema-form";
import { whenOf } from "$lib/when";

/** What the typed line drives: the capability that decides at delivery. */
const CREATE_OR_APPEND = "create-or-append";
/** The one field the typed line drives. */
export const LINE_FIELD = "path";
/** Where a folder mode is carried, which core writes and no adapter names. */
const FOLDER_MODE = "folder";

/**
 * A route being decided on the route page: where it goes, by which template
 * if any, what it does there and with which arguments, and the words it
 * carries. Everything the steps draw is read off it, and what is sent is
 * built from it.
 */
export class Decision {
  readonly #item: () => Item;
  readonly #destinations = observed(client.destinations.all);

  /** The template a decision started from, which the commit may carry. */
  applied = $state<RoutingTemplate | undefined>(undefined);
  /** What it resolved to, so an untouched decision commits as the template rather than as a copy of it. */
  resolved = $state<ResolvedRoutingTemplate | undefined>(undefined);

  chosen = $state<string | undefined>(undefined);
  described = $state<DestinationDescription | undefined>(undefined);
  capability = $state<string | undefined>(undefined);
  args = $state<Record<string, string>>({});
  said = $state("");
  busy = $state(false);
  /** What the destination line holds, which narrows the bands under it. */
  typed = $state("");

  /**
   * Whether the form is drawn — the capability choice, the line, the fields —
   * over the read-only summary of what a taken template resolved to. A
   * destination chosen directly always wants the form; a template starts
   * read-only, since what it resolved to is already the decision.
   */
  placing = $state(true);

  /** Places routed to before, for the line's greyed continuation and the count beside the name. */
  places = $state<readonly RememberedPlace[]>([]);
  /** What committing the line now would do, which decides what else is asked. */
  forecast = $state<"create" | "append" | undefined>(undefined);

  /** Why one cannot be routed to, learnt by asking it. Retirement needs no asking. */
  refusing = $state<Record<string, string>>({});

  /**
   * The words this one delivery carries, where a person took them from the
   * capture's. `undefined` is the ordinary case and means the item's own, and
   * so does anything equal to what the capture says: what reaches the record is
   * `carried()`'s answer rather than this.
   */
  words = $state<string | undefined>(undefined);
  /** What the last route carried: kept for the next, they are nothing new to lose. */
  wordsSent = $state<string | undefined>(undefined);
  editing = $state(false);

  /** Which sections are open. `destination` and `tags` always are; the rest open on a press or when the flow reaches them. */
  opened = $state({ place: false, preview: false });

  /** What the decision held before `attachments only` was taken, which `everything` gives back. */
  before = $state<
    { capability: string; args: Record<string, string> } | undefined
  >(undefined);

  constructor(item: () => Item) {
    this.#item = item;

    $effect(() => {
      if (this.implied !== undefined && this.capability === undefined) {
        this.capability = this.implied;
      }
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
      if (this.applied !== undefined) return;

      const wanted = presetsFrom(this.declared);
      const held = untrack(() => this.args);
      const seeded = { ...wanted, ...held };
      if (Object.keys(seeded).length !== Object.keys(held).length) {
        this.args = seeded;
      }
    });

    // The pool answers these, so they are asked once the destination is
    // settled and the field the line drives is known.
    $effect(() => {
      const { chosen, capability, line } = this;
      if (chosen === undefined || capability === undefined) return;
      if (line === undefined) return;

      let live = true;
      void (async () => {
        try {
          const answer = await client.destinations.remembered(chosen, {
            capability,
            field: line.name,
          });
          if (live) this.places = answer.places;
        } catch {
          // The pool answering nothing costs the line its ghost and nothing else.
          if (live) this.places = [];
        }
      })();

      return () => {
        live = false;
      };
    });
  }

  get item(): Item {
    return this.#item();
  }

  /** What the capture says, which is what editing starts from and what it replaces. */
  readonly captured = $derived(client.says(this.item));
  readonly attachments = $derived(client.attachments(this.item));

  /**
   * What this delivery says, from which the name of an unnamed note is
   * derived: the rewrite where there is one, the capture's own words otherwise.
   */
  readonly spoken = $derived<Said>({
    content: this.carried().content ?? this.item.payload.content,
    item: this.item.id,
  });

  /**
   * What this item could be done with. A capability that carries the
   * attachments alone is left out where the item has none: there is nothing for
   * it to carry, so offering it would offer a delivery bound to be rejected —
   * and a kind whose other capability is its only one then settles that one
   * again, asking nothing. One already taken stays, a template having taken it.
   */
  readonly capabilities = $derived<readonly Capability[]>(
    (this.described?.kind === "described"
      ? this.described.capabilities
      : []
    ).filter(
      (one) =>
        !carriesAssets(one) ||
        this.attachments.length > 0 ||
        one.name === this.capability,
    ),
  );

  /** What an argument left unset falls back to, where the kind says it inherits one. */
  readonly inherited = $derived(
    this.#destinations.current.find((one) => one.id === this.chosen)
      ?.settings ?? {},
  );

  readonly chosenCapability = $derived(
    this.capabilities.find((one) => one.name === this.capability),
  );

  /** The capability that carries the attachments and nothing else, where the destination has one. */
  readonly carrier = $derived(this.capabilities.find(carriesAssets));
  readonly assetsOnly = $derived(
    this.chosenCapability !== undefined && carriesAssets(this.chosenCapability),
  );

  /**
   * The words the head draws: a rewrite is set aside while only the
   * attachments go, and comes back with `everything`.
   */
  readonly shownWords = $derived(
    this.assetsOnly ? this.captured : (this.words ?? this.captured),
  );
  readonly declared = $derived(
    fieldsOf(this.chosenCapability?.argumentsSchema),
  );
  readonly reading = $derived(readingOf(this.chosenCapability));

  /**
   * Only the fields that mean something given the others: a switch about the
   * tags is not drawn while no tags go, and whatever it held is not sent.
   */
  readonly fields = $derived.by(() => {
    const effective = effectiveOf(this.declared, this.args, this.inherited);
    return this.declared.filter((one) => offered(one, effective));
  });

  /**
   * Where the line is what draws the place, *what will happen* is not a step:
   * it is read off the line, and the line is what changes it. A destination
   * whose line field is no path is asked, where it has more than one to be
   * asked about.
   */
  readonly settles = $derived(
    this.capabilities.some(
      (one) =>
        one.name === CREATE_OR_APPEND &&
        fieldsOf(one.argumentsSchema).some(
          (field) => field.name === LINE_FIELD && field.path !== undefined,
        ),
    ),
  );

  /**
   * What the surface settles when nothing else has: the line's own capability
   * where the line is drawn, and the only one there is otherwise. A kind that
   * can do one thing is not offering a choice, so it is not asked to be made.
   *
   * **Only when nothing else has.** A template carries a capability, and it is
   * applied in the same step the description lands in — so this runs after it
   * and must not overwrite it.
   */
  readonly implied = $derived(
    this.settles
      ? CREATE_OR_APPEND
      : this.capabilities.length === 1
        ? this.capabilities[0]?.name
        : undefined,
  );

  /**
   * Only beside a capability the surface settles, which is what `everything`
   * gives back; a kind that settles nothing offers the carrier under `do`.
   */
  readonly offersOutput = $derived(
    this.carrier !== undefined &&
      this.implied !== undefined &&
      this.implied !== this.carrier.name &&
      (this.attachments.length > 0 || this.assetsOnly),
  );

  /** Nothing to pick among is nothing to draw: the line and the fields are the whole decision. */
  readonly chooses = $derived(
    this.capabilities.length > 1 && this.implied === undefined,
  );

  /** What a taken template asks for each time, by field. */
  readonly asking = $derived(this.applied?.asked ?? {});
  /** The fields it asks for, drawn open while the rest of what it resolved to is read-only. */
  readonly askedFields = $derived(
    this.fields.filter((one) => one.name in this.asking),
  );
  /** Every asked field holds a value, given or the default it resolved with. */
  readonly askedSettled = $derived(
    this.askedFields.every((one) => (this.args[one.name] ?? "").trim() !== ""),
  );

  /** A choice of a few that shapes what is written, rather than where. */
  isHow(one: Field): boolean {
    return (
      one.options !== undefined &&
      !one.listable &&
      one.path === undefined &&
      !OWN_ARGUMENTS.includes(one.name) &&
      !(one.name in this.asking)
    );
  }

  readonly howFields = $derived(
    this.placing ? this.fields.filter((one) => this.isHow(one)) : [],
  );
  readonly hasHow = $derived(
    this.placing &&
      (this.offersOutput || this.chooses || this.howFields.length > 0),
  );

  /** A template's place stands until it is changed for one route. */
  readonly templated = $derived(this.applied !== undefined && !this.placing);

  readonly ready = $derived(
    this.chosen !== undefined &&
      this.capability !== undefined &&
      this.askedSettled,
  );

  readonly line = $derived(this.fields.find((one) => one.name === LINE_FIELD));

  /** Whether the typed line draws the place, which needs the destination to hold a filesystem. */
  readonly lined = $derived(
    this.chosen !== undefined && this.settles && this.line !== undefined,
  );

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
  readonly #beside = $derived(
    this.forecast === "create"
      ? []
      : this.fields.filter(
          (one) => one.name !== LINE_FIELD && !OWN_ARGUMENTS.includes(one.name),
        ),
  );

  /** Notemap's own folder mode, asked only where the place is a new note in a folder. */
  readonly folderMode = $derived(
    this.lined &&
      this.forecast === "create" &&
      placeOf(this.args[LINE_FIELD] ?? "").directory !== ""
      ? this.fields.find((one) => OWN_ARGUMENTS.includes(one.name))
      : undefined,
  );

  /** What the place step asks beside the line, or every field where there is no line. */
  readonly placeFields = $derived(
    (this.lined ? this.#beside : this.fields).filter(
      (one) => !this.isHow(one) && !OWN_ARGUMENTS.includes(one.name),
    ),
  );

  /** Whether every argument the capability requires has a value: what a preview waits for. */
  readonly settledArguments = $derived(
    this.fields
      .filter((one) => one.required)
      .every((one) => (this.args[one.name] ?? "").trim() !== ""),
  );

  /**
   * The full path the preview's head names: the destination and, from the
   * line where it draws one, the directory and the name a blank leaf would
   * get — the same code the line forecasts with. A kind with no line reads its
   * place the way a record does, off whatever the destination called its
   * arguments.
   */
  readonly previewPlace = $derived.by(() => {
    if (this.chosen === undefined) return undefined;

    const path = this.lined
      ? this.placeFor(this.args[LINE_FIELD] ?? "")
      : placeNamed(valuesFrom(this.fields, this.args), undefined, this.reading);

    return path === undefined ? undefined : `${nameOf(this.chosen)} / ${path}`;
  });

  /** Serialised because a keystroke changes a field of `args` rather than `args`. */
  readonly key = $derived(
    JSON.stringify({
      chosen: this.chosen,
      capability: this.capability,
      args: this.args,
      words: this.words,
    }),
  );

  /** Read once on arrival: a count that re-dated itself as you typed would be noise. */
  readonly #now = Date.now();

  /** What the chosen destination has been routed to before, said beside its name. */
  readonly usedBefore = $derived.by(() => {
    if (this.places.length === 0) return undefined;
    const routed = this.places.reduce((sum, place) => sum + place.uses, 0);
    const last = this.places
      .map((place) => place.lastAt)
      .sort()
      .at(-1);
    return {
      lead: `${String(routed)} routed`,
      rest: last === undefined ? undefined : `last ${whenOf(last, this.#now)}`,
    };
  });

  /**
   * Whether something has been chosen or written since the surface opened or
   * last routed. The item's tags are not part of it: a tag is applied to the
   * pool when taken.
   */
  readonly entered = $derived(
    this.chosen !== undefined ||
      this.applied !== undefined ||
      (this.words !== undefined &&
        this.words !== this.captured &&
        this.words !== this.wordsSent),
  );

  placeFor(value: string): string {
    const { directory } = placeOf(value);
    const filename = leafOf(value, this.spoken);
    return directory === "" ? filename : `${directory}/${filename}`;
  }

  /** A field given a value, the rest of the arguments kept. */
  give(field: string, value: string): void {
    this.args = { ...this.args, [field]: value };
  }

  /**
   * Takes the carrier, or gives back what was held before it, in the folder as
   * it now stands and keeping the folder mode, and opens the place it changed.
   * A template's capability comes back as itself, not as the settled one.
   */
  output(attachmentsOnly: boolean): void {
    const { carrier, implied, capability } = this;
    if (carrier === undefined || implied === undefined) return;
    if (capability === undefined || attachmentsOnly === this.assetsOnly) return;
    this.placing = true;
    this.opened.place = true;
    this.forecast = undefined;

    const folder = folderIn(this.chosenCapability?.argumentsSchema, this.args);
    const mode = this.args[FOLDER_MODE];
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
      this.before = { capability, args: this.args };
      this.capability = carrier.name;
      this.args = carried(carrier.argumentsSchema, {});
      return;
    }

    const back = this.before ?? { capability: implied, args: {} };
    this.before = undefined;
    this.capability = back.capability;
    this.args = carried(
      this.capabilities.find((one) => one.name === back.capability)
        ?.argumentsSchema,
      back.args,
    );
  }

  /** A destination taken, its description still to come. */
  settle(id: string): void {
    this.chosen = id;
    this.described = undefined;
    this.capability = undefined;
    this.args = {};
    this.said = "";
    this.places = [];
    this.forecast = undefined;
    this.opened.place = true;
    this.placing = true;
  }

  /** Nothing chosen, nothing applied: the decision as the surface opened it. */
  release(): void {
    this.applied = undefined;
    this.resolved = undefined;
    this.chosen = undefined;
    this.described = undefined;
    this.capability = undefined;
    this.args = {};
    this.said = "";
    this.places = [];
    this.forecast = undefined;
    this.placing = true;
    this.before = undefined;
  }

  /**
   * An untouched decision commits as the template, so the record names it and
   * an `establish` template learns that its folder is there. Corrected, it is a
   * decision of the person's own and goes as one — the template was where it
   * started, not what it stayed.
   */
  request() {
    const wanted = valuesFrom(this.fields, this.args);
    const { applied, resolved } = this;
    const untouched =
      applied !== undefined &&
      resolved !== undefined &&
      this.capability === resolved.capability &&
      sameArguments(
        this.#fixedOf(wanted),
        this.#fixedOf(this.#offeredOf(resolved.arguments)),
      );

    if (untouched) {
      const given = Object.fromEntries(
        Object.entries(wanted).filter(
          (entry): entry is [string, string] =>
            entry[0] in this.asking && typeof entry[1] === "string",
        ),
      );
      return {
        template: applied.id,
        ...(Object.keys(given).length === 0 ? {} : { arguments: given }),
        ...this.carried(),
      };
    }

    return {
      destination: this.chosen as string,
      capability: this.capability as string,
      arguments: wanted,
      ...this.carried(),
    };
  }

  /** The arguments without what the template asks, which are the only ones taking it may change. */
  #fixedOf(values: Readonly<Record<string, unknown>>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(values).filter(([name]) => !(name in this.asking)),
    );
  }

  /**
   * A template may hold a value for a field the form is not offering — the
   * destination's settings moved since it was saved, or it was written over
   * the wire. The form sends nothing for it, so comparing against the whole
   * would call every such template touched and commit it as the person's own.
   */
  #offeredOf(held: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const names = this.fields.map((one) => one.name);
    return Object.fromEntries(
      Object.entries(held).filter(([name]) => names.includes(name)),
    );
  }

  /**
   * What this delivery says, where it is not what the item says. Words nobody
   * changed carry nothing: the presence of `content` on the record is the fact
   * that a person rewrote it, so opening the field and typing nothing must not
   * leave a record claiming a rewrite that never happened. Only the payload's
   * content is replaced, so the assets stay the capture's.
   */
  carried(): { content?: Record<string, unknown> } {
    return this.assetsOnly ||
      this.words === undefined ||
      this.words === this.captured
      ? {}
      : { content: saidAs(this.#item().payload, this.words).content };
  }

  /**
   * Opens the capture's words for typing. They are this delivery's alone: the
   * item is never changed, and wanting the fix everywhere is wanting `edit` on
   * the row. Says whether it opened.
   */
  edit(): boolean {
    if (this.assetsOnly) return false;
    this.words ??= this.captured;
    this.editing = true;
    return true;
  }

  done(): void {
    this.editing = false;
  }

  /** The way back: this delivery carries the capture's words after all. */
  keep(): void {
    this.words = undefined;
    this.editing = false;
  }
}
