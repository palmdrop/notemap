import { saidBy, type Item } from "@notemap/client";

import { logHref } from "$components/log/href";

import { client } from "../client";
import { copyable } from "../clipboard";
import { aboutItem } from "../excerpt";
import { editable } from "../lineage";
import { notices } from "../notices.svelte";
import { DISCARD, MANUAL, refusalFor } from "../processing";
import { discard, manual } from "../quick";

import { DECIDE, WORK, type Command } from "./command";

/**
 * What a surface hands `commandsFor` beyond the item itself. `address` is
 * where this item is read, absent on the surface that already is it; `tag`
 * is `Row`'s own exported `+`, absent where nothing on this surface draws
 * one.
 */
export type Surroundings = {
  readonly address?: string;
  readonly offline?: boolean;
  readonly onprocess: () => void;
  readonly onedit: () => void;
  readonly tag?: () => void;
};

/**
 * The one action whose result is nowhere on the screen: everything else here
 * either changes the row or takes you somewhere. So every outcome speaks in
 * the corner, naming what it took rather than saying *copied* into the air.
 */
async function copy(item: Item): Promise<void> {
  const about = aboutItem(item);
  try {
    await navigator.clipboard.writeText(client.says(item));
    notices.raise({ what: "copied", about });
  } catch (error) {
    notices.raise({ what: saidBy(error), about, standing: true });
  }
}

/**
 * Not processing: this puts the item back rather than sending it away. The
 * row updating is what says it worked, so only the failure has to speak, and
 * has to speak in the corner — a key that took it may leave no row on screen.
 */
function undiscard(item: Item): void {
  void client.unarchive(item.id).catch((error: unknown) => {
    notices.raise({
      what: saidBy(error),
      about: aboutItem(item),
      standing: true,
    });
  });
}

/**
 * Every command an item offers: the quick tier that needs no destination, and
 * working with the item beside it. Pure — closing over nothing but what it is
 * given — so a surface can ask what a person could do right now without
 * taking anything, and `Actions` can draw the answer rather than rewire it.
 */
export function commandsFor(item: Item, at: Surroundings): readonly Command[] {
  const offline = at.offline ?? false;
  const holds = client.says(item);

  const commands: Command[] = [
    // Never disabled: what a decision needs of the pool is that surface's to
    // say, not this row's.
    {
      id: "process",
      label: "process",
      group: DECIDE,
      primary: true,
      run: at.onprocess,
    },
    {
      id: MANUAL,
      label: "manual",
      group: DECIDE,
      refusal: refusalFor(MANUAL, item, offline),
      run: () => void manual(item),
    },
    {
      id: DISCARD,
      label: "discard",
      group: DECIDE,
      alarm: true,
      refusal: refusalFor(DISCARD, item, offline),
      run: () => discard(item),
    },
  ];

  if (item.archived !== undefined) {
    commands.push({
      id: "undiscard",
      label: "undiscard",
      group: DECIDE,
      run: () => undiscard(item),
    });
  }

  // A processed item is not this row's to rewrite: editing it would append a
  // revision, which the queue is not where to do.
  if (editable(item)) {
    commands.push({ id: "edit", label: "edit", group: WORK, run: at.onedit });
  }

  // Offered only where the browser has a clipboard to give, and only where
  // there is something for it to take: a picture with no caption says
  // nothing, and copying it would put an empty string on the clipboard and
  // then claim in the corner to have taken something.
  if (copyable() && holds !== "") {
    commands.push({
      id: "copy",
      label: "copy",
      group: WORK,
      run: () => void copy(item),
    });
  }

  // Somewhere to go rather than something to do, and last, so the gesture
  // that selects a row in place is never the one that leaves it. Where this
  // item is already open, the way there is its own history instead.
  commands.push(
    at.address === undefined
      ? {
          id: "open",
          label: "history",
          group: WORK,
          href: logHref(undefined, item.id),
        }
      : { id: "open", label: "open", group: WORK, href: at.address },
  );

  if (at.tag !== undefined) {
    commands.push({ id: "tag", label: "tag", run: at.tag });
  }

  return commands;
}
