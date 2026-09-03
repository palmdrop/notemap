import type {
  AttemptableDelivery,
  Destinations,
  Duration,
  Lease,
  Pool,
  RoutingRecordId,
  WorkOutcome,
} from "@notemap/core";
import { describe, expect, it } from "vitest";

import { startDeliveryRunner } from "./runner";

const RECORD = "record-1" as RoutingRecordId;

const lease = {
  id: "lease-1",
  job: {
    id: "job-1",
    kind: "delivery",
    subject: { kind: "routing-record", record: RECORD },
  },
} as unknown as Lease;

/**
 * Only the parts the runner reaches: it claims one lease, performs it, and
 * completes it. What `complete` was handed is the whole of what a test asserts.
 */
function pool(deliveryFor: () => Promise<AttemptableDelivery | undefined>): {
  readonly pool: Pool;
  readonly completed: WorkOutcome[];
} {
  const completed: WorkOutcome[] = [];
  let claimed = false;

  const stub = {
    routing: { deliveryFor },
    work: {
      claim: () => Promise.resolve(claimed ? [] : ((claimed = true), [lease])),
      complete: (_id: unknown, outcome: WorkOutcome) => {
        completed.push(outcome);
        return Promise.resolve();
      },
      release: () => Promise.resolve(),
    },
  } as unknown as Pool;

  return { pool: stub, completed };
}

const NEVER_POLLS = 60 * 60 * 1000;

const config = {
  pollIntervalMs: NEVER_POLLS,
  leaseForMs: 60_000 as Duration,
  batch: 4,
};

const destinations: Destinations = {
  kinds: () => [],
  describe: () => Promise.resolve({ capabilities: [] }),
  deliver: () => Promise.resolve({ kind: "delivered" }),
  candidates: () => Promise.reject(new Error("no candidates in this test")),
  probe: () => Promise.reject(new Error("no probe in this test")),
};

describe("a delivery the runner cannot even prepare", () => {
  it("reports a retryable failure rather than letting the drain throw", async () => {
    const { pool: stub, completed } = pool(() =>
      Promise.reject(new Error("database is locked")),
    );
    const runner = startDeliveryRunner(stub, destinations, config);

    // The drain has to answer. A throw here would leave the lease to expire,
    // and an expired delivery lease is abandoned rather than retried.
    await expect(runner.drain()).resolves.toBe(1);
    await runner.stop();

    expect(completed).toEqual([
      {
        kind: "failed",
        retryable: true,
        detail: { code: "delivery-unprepared", detail: "database is locked" },
      },
    ]);
  });

  it("succeeds without attempting anything when the record has gone", async () => {
    const { pool: stub, completed } = pool(() => Promise.resolve(undefined));
    const runner = startDeliveryRunner(stub, destinations, config);

    await runner.drain();
    await runner.stop();

    expect(completed).toEqual([{ kind: "succeeded" }]);
  });

  /**
   * A destination whose kind nothing speaks, or whose settings no longer
   * satisfy it, is proof that nothing was delivered — so it carries on the same
   * terms as an unreachable one, and an edit is what makes the retry land.
   */
  it("retries a destination that has become unusable rather than giving up", async () => {
    const { pool: stub, completed } = pool(() =>
      Promise.resolve({
        kind: "unusable",
        detail: "nothing here speaks the kanban kind",
      }),
    );
    const runner = startDeliveryRunner(stub, destinations, config);

    await runner.drain();
    await runner.stop();

    expect(completed).toEqual([
      {
        kind: "failed",
        retryable: true,
        detail: {
          code: "unreachable",
          detail: "nothing here speaks the kanban kind",
        },
      },
    ]);
  });
});
