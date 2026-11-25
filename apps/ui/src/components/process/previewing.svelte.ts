import { saidBy, type RoutingPreview } from "@notemap/client";

import { client } from "$lib/client";
import { valuesFrom } from "$lib/schema-form";

import type { Decision } from "./decision.svelte";

/** A keystroke in the decision waits this long before the preview is asked for again. */
const SETTLING = 400;

/**
 * What the decision would write, asked of the pool as soon as the destination
 * and its required arguments are settled, and again whenever they or the
 * words change, once the typing has settled. What was shown stays up while
 * the next answer is in flight.
 */
export class Previewing {
  readonly #decision: Decision;

  shown = $state<RoutingPreview | undefined>(undefined);
  /** A preview asked for the decision as it stands, and not yet answered. */
  #asking = $state(false);
  /** The decision the last answer belongs to, whichever way it came back. */
  #answeredFor = $state<string | undefined>(undefined);
  failed = $state("");

  constructor(decision: Decision) {
    this.#decision = decision;

    $effect(() => {
      void decision.key;
      if (!decision.ready || !decision.settledArguments) return;

      const timer = setTimeout(() => void this.#show(), SETTLING);
      return () => clearTimeout(timer);
    });
  }

  /**
   * From the keystroke rather than the request: the settling wait is a wait
   * on the preview too, and what is up meanwhile answers a decision that no
   * longer stands.
   */
  readonly pending = $derived.by(() => {
    const decision = this.#decision;
    return (
      decision.ready &&
      decision.settledArguments &&
      (this.#asking || this.#answeredFor !== decision.key)
    );
  });

  clear(): void {
    this.shown = undefined;
    this.failed = "";
    this.#asking = false;
    this.#answeredFor = undefined;
  }

  async #show(): Promise<void> {
    const decision = this.#decision;
    const { chosen, capability } = decision;
    if (chosen === undefined || capability === undefined) return;

    // The answer belongs to the decision it was asked with. One that resolves
    // after the person has moved on is dropped rather than drawn under
    // arguments it knows nothing about.
    const asked = decision.key;
    this.#asking = true;
    try {
      const answer = await client.routing.preview(decision.item.id, {
        destination: chosen,
        capability,
        arguments: valuesFrom(decision.fields, decision.args),
        ...decision.carried(),
      });
      if (asked === decision.key) {
        this.#answeredFor = asked;
        this.shown = answer;
        this.failed = "";
        decision.opened.preview = true;
      }
    } catch (error) {
      if (asked === decision.key) {
        this.#answeredFor = asked;
        this.failed = saidBy(error);
        decision.opened.preview = true;
      }
    } finally {
      if (asked === decision.key) this.#asking = false;
    }
  }
}
