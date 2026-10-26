import { recordAction } from "../actions";
import { enqueueMirrorWrite } from "../mirror";
import { ok, refused } from "#utils/result";
import type { PoolPorts, PoolTx } from "#types/api/ports";
import type { ReinstateRefusal, WithdrawRefusal } from "#types/api/refusal";
import type { RoutingRecordId, TagName, Timestamp } from "#types/domain/ids";
import type { RoutingRecord } from "#types/domain/routing";
import type { Result } from "#types/result";
import { destinationDetail, templateDetail } from "./delivery";
import {
  alreadyApplied,
  releaseTriggerTag,
  returnTriggerTag,
} from "../templates/fire";

export function withdraw(
  ports: PoolPorts,
  id: RoutingRecordId,
): Promise<Result<RoutingRecord, WithdrawRefusal>> {
  return ports.store.transaction(async (tx) => {
    const record = await tx.routingRecord(id);
    if (record === undefined) {
      return refused({ kind: "no-such-record", record: id });
    }
    if (record.target.kind === "user") {
      return refused({ kind: "marked-by-hand", record: id });
    }
    if (record.state !== "delivered") {
      return refused({ kind: "not-delivered", record: id });
    }
    if (record.withdrawnAt !== undefined) {
      return refused({ kind: "already-withdrawn", record: id });
    }

    const at = ports.clock.now();
    await tx.setRoutingRecordWithdrawn(id, at);
    const gave = await releaseTriggerTag(ports, tx, record, at, "person");
    await settled(ports, tx, record, at, "delivery-withdrawn", gave);

    return ok({ ...record, withdrawnAt: at });
  });
}

export function reinstate(
  ports: PoolPorts,
  id: RoutingRecordId,
): Promise<Result<RoutingRecord, ReinstateRefusal>> {
  return ports.store.transaction(async (tx) => {
    const record = await tx.routingRecord(id);
    if (record === undefined) {
      return refused({ kind: "no-such-record", record: id });
    }
    const withdrawnAt = record.withdrawnAt;
    if (withdrawnAt === undefined) {
      return refused({ kind: "not-withdrawn", record: id });
    }

    const item = await tx.item(record.item);
    const edited = item?.contentUpdatedAt;
    if (edited !== undefined && Date.parse(edited) >= Date.parse(withdrawnAt)) {
      return refused({ kind: "edited-since-withdrawal", record: id });
    }

    if (record.applied !== undefined) {
      const since = await alreadyApplied(
        tx,
        record.item,
        record.applied.template,
      );
      if (since !== undefined) {
        return refused({ kind: "superseded", record: id, by: since.id });
      }
    }

    const at = ports.clock.now();
    await tx.setRoutingRecordWithdrawn(id, undefined);
    const put = await returnTriggerTag(ports, tx, record, at);
    await settled(ports, tx, record, at, "delivery-reinstated", put);

    const { withdrawnAt: _, ...reinstated } = record;
    return ok<RoutingRecord, ReinstateRefusal>(reinstated);
  });
}

async function settled(
  ports: PoolPorts,
  tx: PoolTx,
  record: RoutingRecord,
  at: Timestamp,
  kind: "delivery-withdrawn" | "delivery-reinstated",
  /** The trigger tag that came off or went back on with it. */
  tag: TagName | undefined,
): Promise<void> {
  await enqueueMirrorWrite(ports, tx, { kind: "item", item: record.item }, at);
  await recordAction(ports, tx, {
    kind,
    subject: record.item,
    by: { kind: "person" },
    at,
    detail: {
      record: record.id,
      ...destinationDetail(record),
      ...templateDetail(record),
      ...(tag === undefined ? {} : { tag }),
    },
  });
}
