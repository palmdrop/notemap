import type { RoutingRecord, RoutingTemplate } from "@notemap/client";

import { itemHref } from "$components/item/href";

import { FIRED } from "./action-log";
import { client } from "./client";
import { notices } from "./notices.svelte";
import { firedKey } from "./routing";
import { nameOf, triggeredBy } from "./templates";

/**
 * Calling off a route a trigger tag made, inside the window it waits out. The
 * pool takes the tag off with the reservation, so the item comes back to the
 * queue able to be filed by that tag again.
 */
export function cancelRouting(record: string, item: string): void {
  void client.routing.cancel(record, item).catch(() => {
    notices.raise({ what: "could not cancel", standing: true });
  });
}

/**
 * How long to keep looking for what the tag fired. The tag goes through the
 * outbox, so what the pool holds is a moment behind the gesture — but only a
 * moment, and all of this is inside a window measured in seconds.
 */
const LOOKS = [0, 500, 1500] as const;

/**
 * What a trigger tag just did, said by the shell that did it rather than waited
 * for from the log. The window a fired template waits out is shorter than the
 * log is polled, so a corner that learns this the slow way offers a cancel with
 * most of the window already spent — and a cancel nobody can see in time is not
 * the guarantee ADR 37 bought.
 *
 * The record is looked up rather than assumed, because the offer is only real
 * with one. It is said under the log's own name for the same firing, so the
 * entry arriving later adds nothing.
 *
 * Quiet where anything is missing — offline, or a tag that fired nothing. This
 * is the shell being quick, never what establishes that it happened: nothing
 * here writes, and the log says it all again regardless.
 */
export async function sayItFired(item: string, tag: string): Promise<void> {
  const template = triggeredBy(tag);
  if (template === undefined) return;

  const fired = await firingOn(item, template);
  if (fired === undefined) return;

  notices.raise({
    what: `routing · ${nameOf(template.id)}`,
    href: itemHref(item),
    standing: true,
    alarm: false,
    only: FIRED,
    key: firedKey(fired.id),
    offer: { label: "cancel", take: () => cancelRouting(fired.id, item) },
  });
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
