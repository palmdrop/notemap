import { observed } from "$lib/observed.svelte";

import {
  saidBy,
  type Item,
  type RoutedRecord,
  type RoutingRecord,
} from "@notemap/client";

import { processHref } from "$components/item/href";
import { resolve } from "$app/paths";
import { client } from "$lib/client";
import { nameOf } from "$lib/destinations";
import { cancelRouting, routedHere } from "$lib/firing";
import { firings, left, offerOf, phaseOf } from "$lib/firings.svelte";
import { notices } from "$lib/notices.svelte";
import { recordsOf } from "$lib/records.svelte";
import { keyFor } from "$lib/routing";
import { templatable } from "$lib/template-draft";
import { trail } from "$lib/trail.svelte";
import type { Fact } from "$lib/vocabulary";

import type { Decision } from "./decision.svelte";
import type { Steps } from "./steps.svelte";

/** The route just made, drawn in the check's place until the next decision. */
export type Routed = {
  readonly record: RoutedRecord;
  readonly to: string;
  readonly facts: readonly Fact[];
};

/**
 * Sending the decision, what became of it, and moving on to the next item in
 * the queue.
 */
export class Sending {
  readonly #decision: Decision;
  readonly #steps: Steps;
  readonly #tags: () => readonly string[];
  /** Everything but the item back as the surface opened it. */
  readonly #release: () => void;

  readonly #destinations = observed(client.destinations.all);
  readonly #templates = observed(client.templates.all);
  readonly #queue = observed(client.queue);

  readonly records: ReturnType<typeof recordsOf>;

  /** The route made here last, which the head offers to take back while its route is in flight. */
  #made = $state<RoutedRecord | undefined>(undefined);

  routed = $state<Routed | undefined>(undefined);

  /**
   * The queue in its current order, which is what the surface walks. Kept as
   * they stood while the item was still on the queue: a decision takes it off
   * before the surface moves on, and the row after it is still the one to go
   * to. An item that was never on the queue has no neighbours.
   */
  around = $state<{ previous?: Item; next?: Item }>({});

  constructor(
    decision: Decision,
    steps: Steps,
    {
      tags,
      summary,
      offline,
      release,
    }: {
      tags: () => readonly string[];
      summary: () => Item["routing"];
      offline: () => boolean;
      release: () => void;
    },
  ) {
    this.#decision = decision;
    this.#steps = steps;
    this.#tags = tags;
    this.#release = release;

    /** Only a change of item or of the records counted asks again, not every change to the held copy. */
    const counted = $derived.by(() => {
      const routing = summary();
      return routing === undefined
        ? undefined
        : `${decision.item.id}:${String(routing.records)}:${String(routing.pending)}`;
    });
    this.records = recordsOf(
      () => (counted === undefined ? undefined : decision.item.id),
      () => !offline(),
    );

    $effect(() => {
      const rows = this.#queue.current.items;
      const at = rows.findIndex((one) => one.id === decision.item.id);
      if (at === -1) return;
      this.around = { previous: rows[at - 1], next: rows[at + 1] };
    });
  }

  /** As the status line offers it, from the same route in flight: one that has landed is gone from both. */
  readonly takeable = $derived.by(() => {
    const record = this.#made;
    if (record === undefined) return undefined;
    const flying = firings.open.find((one) => one.record === record.id);
    if (flying === undefined) return undefined;
    const landed = this.records.all.some(
      (one) => one.id === record.id && one.state !== "pending",
    );
    const offer = offerOf(flying, firings.now);
    return landed || offer === undefined ? undefined : { record, offer };
  });

  async takeBack(record: RoutedRecord): Promise<void> {
    await cancelRouting(record.id, record.item);
    this.records.reread();
  }

  /** Where the route just made stands: in its window, sent, landed, or turned down. */
  readonly state = $derived.by(() => {
    if (this.routed === undefined) return undefined;
    const { record, to } = this.routed;
    const landed = this.records.all.find((one) => one.id === record.id);
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
  readonly savable = $derived.by(
    () =>
      this.routed !== undefined &&
      this.routed.record.applied === undefined &&
      templatable(this.routed.record, this.#destinations.current),
  );

  async send(): Promise<void> {
    const decision = this.#decision;
    const { chosen, capability } = decision;
    if (chosen === undefined || capability === undefined || decision.busy) {
      return;
    }

    decision.busy = true;
    decision.said = "";
    try {
      const record = await client.routing.route(
        decision.item.id,
        decision.request(),
      );
      this.#classify(record);
      this.#made = record;
      routedHere(record, decision.reading);
      const after = {
        record,
        to: nameOf(chosen),
        facts: this.#steps.facts.map(({ label, value }) => ({ label, value })),
      };
      // The surface stays, cleared: an item may go to more than one place,
      // and Next item is what moves on.
      this.#release();
      this.routed = after;
      decision.wordsSent = decision.words;
      this.records.reread();
    } catch (error) {
      decision.said = saidBy(error);
    } finally {
      decision.busy = false;
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
  #classify(record: RoutingRecord): void {
    const template = this.#templates.current.find(
      (one) => one.id === record.applied?.template,
    );
    const tag = template?.triggerTag;
    if (tag === undefined || this.#tags().includes(tag)) return;

    // Refused, it is the outbox's to report, as every other tag's refusal is.
    void client.tag(this.#decision.item.id, tag).catch(() => undefined);
  }

  /**
   * The row after this item as the queue stands now, whether or not the item
   * is still on it: past the row it stood behind, or from the top where it
   * was first or was never on the queue at all.
   */
  #following(): Item | undefined {
    const rows = this.#queue.current.items;
    const id = this.#decision.item.id;
    const at = rows.findIndex((one) => one.id === id);
    if (at !== -1) return rows[at + 1];

    const before = this.around.previous;
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
  async advance(): Promise<void> {
    let next = this.around.next;
    if (next === undefined && this.#queue.current.more) {
      await client.loadQueue().catch(() => undefined);
      next = this.#following();
    }
    next ??= this.#following();
    await trail.moveOn(
      next === undefined ? resolve("/") : processHref(next.id),
    );
  }

  /** One of its neighbours on the queue, as an entry of its own. */
  walk(to: Item | undefined): void {
    if (to !== undefined) void trail.step(processHref(to.id));
  }
}
