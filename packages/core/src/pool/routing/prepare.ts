import { checkPayload } from "../payload";
import { Unusable, usability } from "../destinations/usability";
import { ok, refused } from "#utils/result";
import type { PoolConfig } from "#types/api/config";
import type { PoolPorts } from "#types/api/ports";
import type { PreparationRefusal } from "#types/api/refusal";
import type {
  Destination,
  DestinationDescriptor,
} from "#types/domain/destination";
import type { ItemId } from "#types/domain/ids";
import type { Item } from "#types/domain/item";
import type { Delivery, DeliveryRequest } from "#types/domain/routing";
import type { Result } from "#types/result";
import { projectDelivery } from "./delivery";

export type Prepared = {
  readonly destination: Destination;
  readonly delivery: Delivery;
};

/** A route refuses an unreachable destination and a preview reports one, so this answers rather than decides. */
export type Unprepared =
  | PreparationRefusal
  | { readonly kind: "unreachable"; readonly detail: string };

/**
 * Everything checkable, checked before anything is written or attempted: this
 * is interactive, and a typo'd argument is worth refusing while the person is
 * still looking at the item. Nothing here reserves, mints or appends.
 */
export async function prepare(
  config: PoolConfig,
  ports: PoolPorts,
  item: ItemId,
  request: DeliveryRequest,
  signal?: AbortSignal,
): Promise<Result<Prepared, Unprepared>> {
  const stored = await ports.store.item(item);
  if (stored === undefined) return refused({ kind: "no-such-item", item });

  return prepareFor(config, ports, stored, request, signal);
}

/**
 * Check and project, against an item the caller is already holding.
 */
export async function prepareFor(
  config: PoolConfig,
  ports: PoolPorts,
  stored: Item,
  request: DeliveryRequest,
  signal?: AbortSignal,
): Promise<Result<Prepared, Unprepared>> {
  const checked = await checkFor(config, ports, stored, request, signal);
  if (checked.kind === "refused") return checked;

  return ok({
    destination: checked.value,
    delivery: await projectDelivery(ports, stored, request),
  });
}

/**
 * The checks alone, against an item the caller is holding — which for a capture
 * arriving already tagged is the only way to make them: the item is not in the
 * pool yet, and the reservation its tag makes has to commit with it.
 *
 * Nothing is projected. A decision that reserves rather than attempts has no
 * use for a delivery, and building one reads the item's assets for nothing.
 */
export async function checkFor(
  config: PoolConfig,
  ports: PoolPorts,
  stored: Item,
  request: DeliveryRequest,
  signal?: AbortSignal,
): Promise<Result<Destination, Unprepared>> {
  const rewritten = checkRewrite(config, ports, stored, request);
  if (rewritten !== undefined) return refused(rewritten);

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

  return ok(destination);
}

/**
 * The identical check a capture gets, against the item's own payload type: the
 * words a delivery carries are the same kind of thing the capture holds, and
 * one the pool would have refused on the way in is not made acceptable by
 * arriving on the way out. Absent content is not a refusal and never was one.
 */
function checkRewrite(
  config: PoolConfig,
  ports: PoolPorts,
  stored: Item,
  request: DeliveryRequest,
): Unprepared | undefined {
  if (request.content === undefined) return undefined;

  const refusal = checkPayload(config, ports, {
    ...stored.payload,
    content: request.content,
  });

  return refusal === undefined
    ? undefined
    : refusal.kind === "payload-invalid"
      ? { kind: "content-invalid", issues: refusal.issues }
      : refusal;
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
