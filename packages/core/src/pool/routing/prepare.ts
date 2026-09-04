import { Unusable, usability } from "../destinations/usability";
import { ok, refused } from "#utils/result";
import type { PoolPorts } from "#types/api/ports";
import type { PreparationRefusal } from "#types/api/refusal";
import type {
  Destination,
  DestinationDescriptor,
} from "#types/domain/destination";
import type { ItemId } from "#types/domain/ids";
import type { Delivery, DeliveryRequest } from "#types/domain/routing";
import type { Result } from "#types/result";
import { projectDelivery } from "./delivery";

/** Everything a destination is about to be handed, and nothing written yet. */
export type Prepared = {
  readonly destination: Destination;
  readonly delivery: Delivery;
};

/**
 * A destination that could not say what it accepts cannot have arguments
 * checked against it. What that means differs between the two callers — a route
 * refuses, a preview reports — so it is answered rather than decided here.
 */
export type Unprepared =
  | PreparationRefusal
  | { readonly kind: "unreachable"; readonly detail: string };

/**
 * Everything checkable, checked before anything is written or attempted: this
 * is interactive, and a typo'd argument is worth refusing while the person is
 * still looking at the item. Nothing here reserves, mints or appends, which is
 * what lets a preview run it too.
 */
export async function prepare(
  ports: PoolPorts,
  item: ItemId,
  request: DeliveryRequest,
  signal?: AbortSignal,
): Promise<Result<Prepared, Unprepared>> {
  const destination = await ports.store.destination(request.destination);
  if (destination === undefined) {
    return refused({
      kind: "unknown-destination",
      destination: request.destination,
    });
  }
  if (destination.retiredAt !== undefined) {
    return refused({
      kind: "destination-retired",
      destination: destination.id,
    });
  }

  const usable = usability(ports, destination);
  if (usable.kind === "unusable") {
    return refused({
      kind: "destination-unusable",
      destination: destination.id,
      detail: usable.detail,
    });
  }

  const described = await describeOrRefuse(ports, destination, signal);
  if (described.kind === "refused") return described;

  const capability = described.value.capabilities.find(
    (each) => each.name === request.capability,
  );
  if (capability === undefined) {
    return refused({
      kind: "capability-undeclared",
      capability: request.capability,
    });
  }

  const stored = await ports.store.item(item);
  if (stored === undefined) return refused({ kind: "no-such-item", item });

  if (!capability.accepts.includes(stored.payload.type)) {
    return refused({
      kind: "payload-type-unsupported",
      type: stored.payload.type,
      accepts: capability.accepts,
    });
  }

  const issues = ports.schemas.validate(
    capability.argumentsSchema,
    request.arguments,
  );
  if (issues.length > 0) return refused({ kind: "arguments-invalid", issues });

  return ok({
    destination,
    delivery: await projectDelivery(ports, stored, request),
  });
}

async function describeOrRefuse(
  ports: PoolPorts,
  destination: Destination,
  signal?: AbortSignal,
): Promise<Result<DestinationDescriptor, Unprepared>> {
  try {
    return ok(await ports.destinations.describe(destination, signal));
  } catch (cause) {
    if (cause instanceof Unusable) {
      return refused({
        kind: "destination-unusable",
        destination: destination.id,
        detail: cause.message,
      });
    }
    return refused({
      kind: "unreachable",
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
