import { observed } from "$lib/observed.svelte";

import { saidBy, type RoutingTemplate } from "@notemap/client";

import { client } from "$lib/client";
import { search } from "$lib/matching";
import {
  DISCARD,
  HAND,
  MANUAL,
  refusalFor,
  type ByHand,
} from "$lib/processing";
import { discard, manual } from "$lib/quick";

import type { Decision } from "./decision.svelte";

/**
 * Where the route goes: the templates, the destinations and the two by hand,
 * narrowed together by what the line holds, each saying why it cannot be
 * taken where it cannot.
 */
export class Choosing {
  readonly #decision: Decision;
  readonly #offline: () => boolean;
  /** Everything but the item back as the surface opened it. */
  readonly #release: () => void;
  /** On to the next item, after a decision that needs no destination. */
  readonly #advance: () => Promise<void>;

  readonly #destinations = observed(client.destinations.all);
  readonly #templates = observed(client.templates.all);

  constructor(
    decision: Decision,
    {
      offline,
      release,
      advance,
    }: {
      offline: () => boolean;
      release: () => void;
      advance: () => Promise<void>;
    },
  ) {
    this.#decision = decision;
    this.#offline = offline;
    this.#release = release;
    this.#advance = advance;
  }

  get destinations() {
    return this.#destinations.current;
  }

  get templates() {
    return this.#templates.current;
  }

  /**
   * Why each entry cannot be taken, templates, destinations and the two by hand
   * alike. The line reads it to refuse a name, and the bands draw it beside
   * one. Never a pattern: expansion is statically total, so a template that
   * saved applies to any item.
   */
  readonly unusable = $derived.by(() => {
    const all: Record<string, string | undefined> = {};
    for (const one of this.destinations) {
      all[one.id] = this.#reasonFor(one.id);
    }
    for (const one of this.templates) {
      all[one.id] = this.#templateReason(one);
    }
    for (const one of HAND) {
      all[one.id] = refusalFor(
        one.id as ByHand,
        this.#decision.item,
        this.#offline(),
      );
    }
    return all;
  });

  #reasonFor(id: string): string | undefined {
    if (this.#offline()) return "pool out of reach";
    return this.#decision.refusing[id];
  }

  /**
   * What the cache alone can say. What only the destination can — a capability
   * it no longer declares — is learnt by taking one, as it is for a
   * destination, and lands in `refusing`.
   */
  #templateReason(one: RoutingTemplate): string | undefined {
    const destination = this.destinations.find(
      (each) => each.id === one.destination,
    );
    if (destination === undefined) return "its destination was deleted";
    if (destination.retired === true) return "its destination is disabled";
    if (this.#offline()) return "pool out of reach";
    return this.#decision.refusing[one.id];
  }

  /** The three bands, narrowed together by what the line holds. */
  #byName<T extends { readonly name: string }>(list: readonly T[]) {
    return search(list, this.#decision.typed, (one) => [one.name]);
  }

  readonly templatesShown = $derived.by(() => this.#byName(this.templates));
  /** A disabled destination is not somewhere to route to, and is not offered as one. */
  readonly offeredDestinations = $derived.by(() =>
    this.destinations.filter((one) => one.retired !== true),
  );
  readonly destinationsShown = $derived.by(() =>
    this.#byName(this.offeredDestinations),
  );
  readonly handShown = $derived.by(() => this.#byName(HAND));

  /** The one entry the line has narrowed to, which `⏎` takes and the bands draw bold. */
  readonly hit = $derived.by(() => {
    if (this.#decision.typed === "") return undefined;
    const all = [
      ...this.templatesShown,
      ...this.destinationsShown,
      ...this.handShown,
    ].filter((one) => this.unusable[one.id] === undefined);
    return all.length === 1 ? all[0]?.id : undefined;
  });

  /** The kind of the destination an id names, for its icon. */
  kindOf(id: string | undefined): string | undefined {
    return this.destinations.find((each) => each.id === id)?.kind;
  }

  /** The typed line knows only names and ids; which band one came from is read here. */
  async taken(id: string): Promise<void> {
    const template = this.templates.find((one) => one.id === id);
    if (template !== undefined) {
      await this.take(template);
      return;
    }
    await this.choose(id);
  }

  /**
   * A template is where the decision starts, not a form that refuses to be
   * corrected: what it resolved to is drawn on the line and stays editable.
   */
  async take(one: RoutingTemplate): Promise<void> {
    const decision = this.#decision;
    this.#release();
    decision.applied = one;
    decision.said = "";

    try {
      const answer = await client.templates.resolve(decision.item.id, one.id);
      decision.resolved = answer;
      // Handed to `choose` rather than set after it: a kind with one capability
      // has it picked as soon as the description lands, and a field drawn in
      // the gap before these arrive binds its own empty value back over them.
      await this.choose(answer.destination, {
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
      if (decision.chosen !== undefined) {
        decision.placing = false;
      } else {
        decision.applied = undefined;
        decision.resolved = undefined;
      }
    } catch (error) {
      decision.refusing = { ...decision.refusing, [one.id]: saidBy(error) };
      decision.applied = undefined;
      decision.resolved = undefined;
    }
  }

  /**
   * I/O that may hang on an unmounted drive, so it happens for the chosen one
   * alone. `from` is where a template starts the decision, applied in the same
   * step the description lands in rather than after it.
   */
  async choose(
    id: string,
    from?: {
      readonly capability: string;
      readonly arguments: Record<string, string>;
    },
  ): Promise<void> {
    const decision = this.#decision;
    if (id === DISCARD) {
      discard(decision.item);
      await this.#advance();
      return;
    }

    if (id === MANUAL) {
      await manual(decision.item);
      await this.#advance();
      return;
    }

    decision.settle(id);

    try {
      const report = await client.destinations.describe(id);
      if (report.kind === "described") {
        decision.described = report;
        if (from !== undefined) {
          decision.capability = from.capability;
          decision.args = from.arguments;
        }
        return;
      }

      // Present and unavailable: it stays in the list saying why, rather than
      // disappearing or looking routable.
      decision.refusing = {
        ...decision.refusing,
        [id]: `${report.kind} — ${report.detail}`,
      };
      decision.chosen = undefined;
    } catch (error) {
      decision.refusing = { ...decision.refusing, [id]: saidBy(error) };
      decision.chosen = undefined;
    }
  }
}
