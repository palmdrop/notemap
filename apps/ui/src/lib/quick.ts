import { saidBy, type Item } from "@notemap/client";

import { itemHref } from "$components/item/href";

import { client } from "./client";
import { aboutItem } from "./excerpt";
import { notices } from "./notices.svelte";
import { DISCARD, MANUAL } from "./processing";
import { keyFor } from "./routing";

/**
 * The two decisions that need no destination and no second step, taken from
 * wherever an item is drawn. Each acts at once and says so in the corner with
 * the way back beside it: the row it was made on may be gone by the time
 * somebody reads it, and neither decision leaves anything on the item to undo
 * from.
 */

export function discard(item: Item): void {
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
}

/**
 * Routing whose destination is the person, with nothing said about where. The
 * pool records it, so what is said here is keyed to the record and the log's
 * own entry adds nothing.
 */
export async function manual(item: Item): Promise<void> {
  const id = item.id;
  const about = aboutItem(item);

  try {
    const record = await client.routing.markProcessed(id);
    notices.raise({
      what: "marked manual",
      about,
      href: itemHref(id),
      standing: true,
      only: MANUAL,
      key: keyFor(record.id),
      offer: {
        label: "undo",
        take: () => {
          void client.routing.cancel(record.id, id).catch(() => {
            notices.raise({ what: "could not undo", about, standing: true });
          });
        },
      },
    });
  } catch (error) {
    notices.raise({ what: saidBy(error), about, standing: true });
  }
}
