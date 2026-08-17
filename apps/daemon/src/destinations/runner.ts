import {
  asDeliveryWorkOutcome,
  DELIVERY_FAILURE,
  type DestinationAdapter,
  type DestinationId,
  type JobKind,
  type Lease,
  type Pool,
  type WorkOutcome,
} from "@notemap/core";

import {
  startRunner,
  wrongSubject,
  type Runner,
  type RunnerConfig,
} from "../work/runner";

const KINDS: readonly JobKind[] = ["delivery"];

export type DeliveryRunnerConfig = RunnerConfig;
export type DeliveryRunner = Runner;

/**
 * Deliveries core could not carry out inline, retried until they land or are
 * given up on. The same loop the mirror runs; only what one job *is* differs.
 */
export function startDeliveryRunner(
  pool: Pool,
  adapters: readonly DestinationAdapter[],
  config: DeliveryRunnerConfig,
  onError?: (cause: unknown) => void,
): DeliveryRunner {
  const byId = new Map<DestinationId, DestinationAdapter>(
    adapters.map((adapter) => [adapter.describe().id, adapter]),
  );

  async function perform(lease: Lease): Promise<WorkOutcome> {
    const subject = lease.job.subject;
    if (subject.kind !== "routing-record") return wrongSubject(lease);

    // Read fresh rather than from a snapshot, so what leaves is the item as it
    // now stands. Absent means there is nothing left to carry out: the record
    // was cancelled, or its item was purged.
    const delivery = await pool.routing.deliveryFor(subject.record);
    if (delivery === undefined) return { kind: "succeeded" };

    const adapter = byId.get(delivery.destination);
    if (adapter === undefined) {
      return {
        kind: "failed",
        retryable: false,
        detail: {
          code: "unknown-destination",
          detail: `${delivery.destination} is no longer wired`,
        },
      };
    }

    try {
      return asDeliveryWorkOutcome(await adapter.deliver(delivery));
    } catch (cause) {
      // An adapter that threw rather than answering reported nothing, and the
      // bytes may or may not have landed. That is the case a person has to
      // check before routing again, so it is never retried.
      return {
        kind: "failed",
        retryable: false,
        detail: {
          code: DELIVERY_FAILURE.unknown,
          detail: `${delivery.destination} threw: ${cause instanceof Error ? cause.message : String(cause)}`,
        },
      };
    }
  }

  return startRunner(pool, KINDS, perform, config, onError);
}
