import {
  asDeliveryWorkOutcome,
  DELIVERY_FAILURE,
  type Delivery,
  type DestinationAdapter,
  type DestinationId,
  type JobKind,
  type Lease,
  type Pool,
  type RoutingRecordId,
  type WorkOutcome,
} from "@notemap/core";

import { DELIVERY_REPORT_MARGIN_MS } from "../constants";
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
    adapters.map((adapter) => [adapter.id, adapter]),
  );

  /**
   * The attempt has to finish while the lease is still held: a lease that
   * expires with nothing reported is abandoned rather than retried, so an
   * unbounded attempt turns a slow destination into a thrown-away decision.
   */
  const attemptMs = Math.max(
    config.leaseForMs - DELIVERY_REPORT_MARGIN_MS,
    DELIVERY_REPORT_MARGIN_MS,
  );

  type Prepared =
    | {
        readonly kind: "ready";
        readonly delivery: Delivery;
        readonly adapter: DestinationAdapter;
      }
    | { readonly kind: "settled"; readonly outcome: WorkOutcome };

  async function prepare(record: RoutingRecordId): Promise<Prepared> {
    try {
      // Read fresh rather than from a snapshot, so what leaves is the item as
      // it now stands. Absent means there is nothing left to carry out: the
      // record was cancelled, its item was purged, or it has already landed.
      const delivery = await pool.routing.deliveryFor(record);
      if (delivery === undefined) {
        return { kind: "settled", outcome: { kind: "succeeded" } };
      }

      const adapter = byId.get(delivery.destination);
      if (adapter === undefined) {
        return {
          kind: "settled",
          outcome: {
            kind: "failed",
            retryable: false,
            detail: {
              code: "unknown-destination",
              detail: `${delivery.destination} is no longer wired`,
            },
          },
        };
      }

      return { kind: "ready", delivery, adapter };
    } catch (cause) {
      // Nothing was attempted, so the evidence rule permits a retry — and this
      // has to answer rather than throw, because a throw here would leave the
      // lease to expire, which is abandoned instead.
      return {
        kind: "settled",
        outcome: {
          kind: "failed",
          retryable: true,
          detail: { code: "delivery-unprepared", detail: why(cause) },
        },
      };
    }
  }

  async function perform(lease: Lease): Promise<WorkOutcome> {
    const subject = lease.job.subject;
    if (subject.kind !== "routing-record") return wrongSubject(lease);

    const prepared = await prepare(subject.record);
    if (prepared.kind === "settled") return prepared.outcome;

    const { adapter, delivery } = prepared;
    try {
      return asDeliveryWorkOutcome(
        await adapter.deliver(delivery, AbortSignal.timeout(attemptMs)),
      );
    } catch (cause) {
      // An adapter that threw rather than answering reported nothing, and the
      // bytes may or may not have landed. That is the case a person has to
      // check before routing again, so it is never retried.
      return {
        kind: "failed",
        retryable: false,
        detail: {
          code: DELIVERY_FAILURE.unknown,
          detail: `${delivery.destination}: ${why(cause)}`,
        },
      };
    }
  }

  return startRunner(pool, KINDS, perform, config, onError);
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
