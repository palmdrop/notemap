import {
  saidBy,
  type Action,
  type RoutedRecord,
  type RoutingRecord,
  type RoutingTemplate,
} from "@notemap/client";

import { itemHref } from "$components/item/href";

import { whereOf, type Supplied } from "./asked";
import { client } from "./client";
import { nameOf as destinationName } from "./destinations";
import { firings } from "./firings.svelte";
import { notices } from "./notices.svelte";
import {
  cancelledKey,
  keyFor,
  placeIn,
  placeShort,
  type Reading,
} from "./routing";
import { tallying } from "./tallies";
import { firingOf } from "./action-log";
import { heldName, nameOf, triggeredBy } from "./templates";

/**
 * Calls off a pending record and ends its route in flight. Where a trigger tag
 * made it, the pool takes the tag off with the reservation, so the item comes
 * back to the queue able to be filed by that tag again. Throws what the pool
 * refused.
 */
export async function callOff(record: string, item: string): Promise<void> {
  // Arriving once the record is gone, the tag would find nothing to absorb it and file the item again.
  const recalls = firings.open.find((one) => one.record === record)?.recalls;
  if (recalls !== undefined) await client.recall(item, recalls);

  await client.routing.cancel(record, item);
  firings.closed(record);
}

/** Calling off a route in flight, and saying so in the status line. */
export function cancelRouting(
  record: string,
  item: string,
  name?: string,
): Promise<void> {
  return callOff(record, item)
    .then(() => {
      notices.settled(keyFor(record));
      // Said at once, under the name the log's own entry arrives with.
      notices.raise({
        what: "routing cancelled",
        ...(name === undefined ? {} : { why: name }),
        href: itemHref(item),
        key: cancelledKey(record),
      });
    })
    .catch((error: unknown) => {
      notices.raise({
        what: `could not cancel: ${saidBy(error)}`,
        alarm: true,
      });
    });
}

/**
 * Calling off every route a batch has in flight, in one request. Each record
 * the pool cancelled closes; one it could not, already landing, stays open
 * and ends as it ends.
 */
export function cancelBatch(batch: string): void {
  const flying = firings.open.filter((firing) => firing.batch === batch);
  if (flying.length === 0) return;

  void client.routing
    .cancelMany(flying.map((firing) => firing.record))
    .then((answer) => {
      for (const one of answer.values) {
        if (one.outcome !== "cancelled") continue;
        firings.closed(one.record);
        notices.settled(keyFor(one.record));
        const said = tallying.ended(one.record, "cancelled");
        if (said !== undefined) notices.raise(said);
      }
    })
    .catch((error: unknown) => {
      notices.raise({
        what: `could not cancel: ${saidBy(error)}`,
        alarm: true,
      });
    });
}

/**
 * A route this shell just made, drawn in flight at once: the log says the same
 * a poll later, and the window is shorter than that.
 */
export function routedHere(record: RoutedRecord, reading?: Reading): void {
  const target = record.target;
  if (target.kind !== "destination") return;

  const applied = record.applied;
  // A template's route is said by its answers, as a trigger tag's is; one by
  // hand by the end of the place it named.
  const place =
    applied === undefined
      ? placeIn(record, undefined, reading)
      : whereOf(applied.template, target.arguments);
  const tag =
    applied === undefined || applied.firedByTag
      ? undefined
      : client.templates.held.find((one) => one.id === applied.template)
          ?.triggerTag;
  firings.opened({
    record: record.id,
    item: record.item,
    name:
      record.applied === undefined
        ? destinationName(target.destination)
        : nameOf(record.applied.template),
    ...(place === undefined
      ? {}
      : { where: applied === undefined ? placeShort(place) : place }),
    until: Date.parse(record.until),
    href: itemHref(record.item),
    ...(tag === undefined ? {} : { recalls: tag }),
  });
}

/** Tags an item, and says what the tag filed where it filed something. */
export async function tagged(
  item: string,
  tag: string,
  supplied?: Supplied,
): Promise<void> {
  await client.tag(item, tag, supplied);
  await sayItFired(item, tag);
}

/**
 * How long to keep looking for what the tag fired. The tag goes through the
 * outbox, so what the pool holds is a moment behind the gesture — but only a
 * moment, and all of this is inside a window measured in seconds.
 */
const LOOKS = [0, 500, 1500] as const;

/**
 * What a trigger tag just did, drawn by the shell that did it rather than
 * waited for from the log. The window a fired template waits out is shorter
 * than the log is polled, so a status line that learned this the slow way would
 * offer a cancel with most of the window already spent.
 *
 * The record is looked up rather than assumed, because the cancel is only real
 * with one, and the log is read for when the window closes. Quiet where
 * anything is missing — offline, or a tag that fired nothing. Nothing here
 * writes, and the log opens the same firing again regardless.
 */
export async function sayItFired(item: string, tag: string): Promise<void> {
  const template = triggeredBy(tag);
  if (template === undefined) return;

  const fired = await firingOn(item, template);
  if (fired === undefined) return;

  const until = await windowOf(item, fired.id);
  const where =
    fired.target.kind === "destination"
      ? whereOf(template.id, fired.target.arguments)
      : undefined;
  firings.opened({
    record: fired.id,
    item,
    name: nameOf(template.id),
    ...(where === undefined ? {} : { where }),
    href: itemHref(item),
    ...(until === undefined ? {} : { until }),
  });
}

/** When the window the pool gave this firing closes, as the log says. */
async function windowOf(
  item: string,
  record: string,
): Promise<number | undefined> {
  try {
    const page = await client.actions.read({
      item,
      kinds: ["template-fired"],
      order: "newest-first",
    });
    const entry = page.values.find(
      (action) =>
        (action.detail as Record<string, unknown>)["record"] === record,
    );
    const until = (entry?.detail as Record<string, unknown> | undefined)?.[
      "until"
    ];
    return typeof until === "string" ? Date.parse(until) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The windows open when this shell started: a reload, or a phone browser
 * that evicted the page, forgets what it was counting. The log keeps what
 * opened them, and the records say which are still pending.
 */
export async function reopenFirings(): Promise<void> {
  let actions: readonly Action[];
  try {
    const page = await client.actions.read({
      kinds: ["template-fired", "delivery-held"],
      order: "newest-first",
    });
    actions = Array.isArray(page.values) ? page.values : [];
  } catch {
    return;
  }
  const now = Date.now();
  const heard = actions.flatMap((action) => {
    const found = firingOf(action, {
      nameOf: destinationName,
      templateOf: heldName,
      whereOf,
      about: itemHref,
    });
    if (found === undefined || !("opened" in found)) return [];
    const until = found.opened.until;
    return until === undefined || until <= now ? [] : [found.opened];
  });
  await Promise.all(
    heard.map(async (firing) => {
      try {
        const records = await client.routing.recordsFor(firing.item);
        const pending = records.some(
          (record) => record.id === firing.record && record.state === "pending",
        );
        if (pending) firings.opened(firing);
      } catch {
        // Out of reach: nothing to count down that could be cancelled.
      }
    }),
  );
}

/**
 * Asks the pool about every route still in flight, and closes those it no
 * longer holds pending: after a catch-up too long to read out, how they ended
 * may be on a page nobody read.
 */
export async function recheckFirings(): Promise<void> {
  await Promise.all(
    firings.open.map(async (firing) => {
      try {
        const records = await client.routing.recordsFor(firing.item);
        const pending = records.some(
          (record) => record.id === firing.record && record.state === "pending",
        );
        if (!pending) firings.closed(firing.record);
      } catch {
        // Out of reach: what it shows is still the last thing known.
      }
    }),
  );
}

async function firingOn(
  item: string,
  template: RoutingTemplate,
): Promise<RoutingRecord | undefined> {
  for (const wait of LOOKS) {
    if (wait > 0) {
      await new Promise((done) => setTimeout(done, wait));
    }

    try {
      const records = await client.routing.recordsFor(item);
      const fired = records.find(
        (record) =>
          record.state === "pending" &&
          record.applied?.template === template.id &&
          record.applied.firedByTag,
      );
      if (fired !== undefined) return fired;
    } catch {
      // The log is the other way this arrives, and it has not been touched.
      return undefined;
    }
  }

  return undefined;
}
