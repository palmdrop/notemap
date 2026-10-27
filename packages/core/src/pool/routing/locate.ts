import { NotOffered } from "../destinations/candidates";
import { usability } from "../destinations/usability";
import { ok, refused } from "#utils/result";
import type { PoolPorts } from "#types/api/ports";
import type { LocateRefusal } from "#types/api/refusal";
import type { RoutingRecordId } from "#types/domain/ids";
import type { Presence } from "#types/domain/routing";
import type { Result } from "#types/result";

/** Reads the record outside any transaction: the destination is asked with nothing held. */
export async function locate(
  ports: PoolPorts,
  id: RoutingRecordId,
  signal?: AbortSignal,
): Promise<Result<Presence, LocateRefusal>> {
  const record = await ports.store.routingRecord(id);
  if (record === undefined) {
    return refused({ kind: "no-such-record", record: id });
  }
  const target = record.target;
  if (target.kind === "user") {
    return refused({ kind: "marked-by-hand", record: id });
  }
  if (record.state !== "delivered") {
    return refused({ kind: "not-delivered", record: id });
  }

  const destination = await ports.store.destination(target.destination);
  if (destination === undefined) {
    return ok({ kind: "unknown", detail: "the destination is gone" });
  }
  const usable = usability(ports, destination);
  if (usable.kind === "unusable") {
    return ok({ kind: "unknown", detail: usable.detail });
  }

  try {
    return ok(
      await ports.destinations.locate(
        destination,
        {
          capability: target.capability,
          arguments: target.arguments,
          ...(record.pointer === undefined ? {} : { pointer: record.pointer }),
          ...(record.pointers === undefined
            ? {}
            : { pointers: record.pointers }),
        },
        signal,
      ),
    );
  } catch (cause) {
    if (cause instanceof NotOffered) return ok({ kind: "unknown" });
    return ok({
      kind: "unknown",
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
