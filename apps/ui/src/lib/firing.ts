import type { RoutingRecord, RoutingTemplate } from "@notemap/client";

import { itemHref } from "$components/item/href";

import { client } from "./client";
import { firings } from "./firings.svelte";
import { notices } from "./notices.svelte";
import { cancelledKey, keyFor } from "./routing";
import { nameOf, triggeredBy } from "./templates";

/**
 * Calling off a route a trigger tag made, inside the window it waits out. The
 * pool takes the tag off with the reservation, so the item comes back to the
 * queue able to be filed by that tag again.
 */
export function cancelRouting(
  record: string,
  item: string,
  name?: string,
): void {
  void client.routing
    .cancel(record, item)
    .then(() => {
      firings.closed(record);
      notices.settled(keyFor(record));
      // Said at once, under the name the log's own entry arrives with.
      notices.raise({
        what: "routing cancelled",
        ...(name === undefined ? {} : { why: name }),
        href: itemHref(item),
        key: cancelledKey(record),
      });
    })
    .catch(() => {
      notices.raise({ what: "could not cancel", alarm: true });
    });
}

/** Tags an item, and says what the tag filed where it filed something. */
export async function tagged(item: string, tag: string): Promise<void> {
  await client.tag(item, tag);
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
  firings.opened({
    record: fired.id,
    item,
    name: nameOf(template.id),
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
