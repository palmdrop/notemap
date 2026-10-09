import type { Observable } from "rxjs";

import type { Action, ItemId } from "#api/types";
import { emitter } from "../observable/observable";
import type { ActionPosition, ActionsPage } from "../types";

/**
 * The rate the reachability probe settles into, so a shell has one tempo. It
 * cannot ride that probe: an answered request pushes the probe out, so a client
 * whose requests are being answered never sends one — which is exactly when
 * somebody is here to be told something.
 */
const STEADY = 10_000;

export type ActionsSince = {
  readonly actions: readonly Action[];
  /** More happened than one read answers, so this is a page of it and not all of it. */
  readonly more: boolean;
  /** The captures and revisions among these that were made somewhere else. */
  readonly arrived: readonly ItemId[];
};

export type Watching = {
  readonly changes: Observable<ActionsSince>;
  watched(yes: boolean): void;
  answering(yes: boolean): void;
  ask(): void;
  stop(): void;
};

/**
 * What the pool has done since this client started looking. The mark is taken
 * from the first read and that read says nothing: a shell that opens by
 * announcing yesterday is worse than one that says nothing at all.
 */
export type Gates = {
  readonly watched: boolean;
  readonly answering: boolean;
  readonly every?: number;
};

export function watching(
  read: () => Promise<ActionsPage>,
  gates: Gates = { watched: true, answering: true },
  /**
   * What the pool did, before anybody is told it, answering which items
   * arrived from elsewhere. Here rather than on the observable, so it runs once
   * however many shells are listening — and not at all while nobody is, the
   * watcher being built by the first `watch()`.
   */
  applied?: (actions: readonly Action[]) => readonly ItemId[],
): Watching {
  const every = gates.every ?? STEADY;

  const reported = emitter<ActionsSince>();

  let mark: ActionPosition | undefined;
  let waiting: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let looking = gates.watched;
  let reachable = gates.answering;
  let asking = false;

  function again(): void {
    clearTimeout(waiting);
    waiting = undefined;
    if (stopped || !looking || !reachable) return;

    waiting = setTimeout(() => {
      waiting = undefined;
      void ask();
    }, every);
  }

  function positionOf(action: Action): ActionPosition {
    return { at: action.at, id: action.id };
  }

  /**
   * Newest first, so what is new sits above the mark. The mark's own entry
   * missing from the page means more happened than a page holds — or that it
   * was cleared from under the read, which is the same answer: a count, and a
   * way through to the log.
   */
  function since(page: ActionsPage): Omit<ActionsSince, "arrived"> {
    const values = page.values;
    const at = values.findIndex((action) => action.id === mark?.id);

    return at === -1
      ? { actions: [...values].reverse(), more: page.after !== undefined }
      : { actions: values.slice(0, at).reverse(), more: false };
  }

  async function ask(): Promise<void> {
    if (stopped || asking) return;

    asking = true;
    try {
      const page = await read();
      const newest = page.values[0];
      if (newest === undefined) return;

      // The first read is the mark and nothing else.
      const said = mark === undefined ? undefined : since(page);
      mark = positionOf(newest);

      if (said !== undefined && said.actions.length > 0) {
        const arrived = applied?.(said.actions) ?? [];
        reported.next({ ...said, arrived });
      }
    } catch {
      // A pool that did not answer says nothing rather than something wrong.
      // The next tick asks again, and reachability is what a person reads.
    } finally {
      asking = false;
      again();
    }
  }

  function gate(): void {
    if (stopped) return;

    if (looking && reachable) {
      void ask();
      return;
    }

    clearTimeout(waiting);
    waiting = undefined;
  }

  gate();

  return {
    changes: reported.changes,

    watched(yes) {
      if (yes === looking) return;
      looking = yes;
      gate();
    },

    /** A pool that is not answering is not asked; coming back asks at once. */
    answering(yes) {
      if (yes === reachable) return;
      reachable = yes;
      gate();
    },

    /**
     * Now rather than on the tempo, for a shell that knows when news is due.
     * The tempo starts again from this read. Nothing while the gates are shut,
     * and nothing extra while a read is already out.
     */
    ask() {
      if (stopped || !looking || !reachable) return;
      clearTimeout(waiting);
      waiting = undefined;
      void ask();
    },

    stop() {
      stopped = true;
      clearTimeout(waiting);
      waiting = undefined;
      reported.end();
    },
  };
}
