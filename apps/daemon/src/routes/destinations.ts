import type { Context } from "hono";

import type {
  Destination,
  DestinationId,
  DestinationKindName,
  JsonObject,
  Pool,
} from "@notemap/core";

import {
  destinationDeletionStatus,
  destinationStatus,
  errorBody,
  retireStatus,
} from "../errors/refusals";
import {
  createDestinationRequestSchema,
  updateDestinationRequestSchema,
} from "../schemas/destination";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

/** What a destination is on the wire: when it was retired is not a client's business. */
function declared(destination: Destination) {
  return {
    id: destination.id,
    name: destination.name,
    kind: destination.kind,
    settings: destination.settings,
    retired: destination.retiredAt !== undefined,
  };
}

/** A read of pool state: it answers at once, cannot fail, and probes nothing. */
export function destinationsHandler(pool: Pool) {
  return async (): Promise<Response> =>
    json({ values: (await pool.destinations.list()).map(declared) }, 200);
}

export function destinationKindsHandler(pool: Pool) {
  return (): Response => json({ values: pool.destinations.kinds() }, 200);
}

/** The one call that reaches the outside world, and so the one that can hang. */
export function destinationDescriptionHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = (context.req.param("id") ?? "") as DestinationId;
    const report = await pool.destinations.describe(id);

    return report === undefined
      ? json(errorBody({ kind: "unknown-destination", destination: id }), 404)
      : json(report, 200);
  };
}

export function createDestinationHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, createDestinationRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const created = await pool.destinations.create({
      name: body.value.name,
      kind: body.value.kind as DestinationKindName,
      settings: body.value.settings as JsonObject,
    });

    return created.kind === "refused"
      ? json(errorBody(created.refusal), destinationStatus(created.refusal))
      : json(declared(created.value), 201, {
          location: `/v1/destinations/${created.value.id}`,
        });
  };
}

export function updateDestinationHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, updateDestinationRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = (context.req.param("id") ?? "") as DestinationId;
    const { name, settings } = body.value;

    const edited = await pool.destinations.edit(id, {
      ...(name === undefined ? {} : { name }),
      ...(settings === undefined ? {} : { settings: settings as JsonObject }),
    });

    return edited.kind === "refused"
      ? json(errorBody(edited.refusal), destinationStatus(edited.refusal))
      : json(declared(edited.value), 200);
  };
}

export function retireDestinationHandler(pool: Pool, offer: boolean) {
  return async (context: Context): Promise<Response> => {
    const id = (context.req.param("id") ?? "") as DestinationId;
    const result = offer
      ? await pool.destinations.unretire(id)
      : await pool.destinations.retire(id);

    return result.kind === "refused"
      ? json(errorBody(result.refusal), retireStatus(result.refusal))
      : json(declared(result.value), 200);
  };
}

/** `204`: the row is gone, so there is nothing to answer with. */
export function deleteDestinationHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = (context.req.param("id") ?? "") as DestinationId;
    const result = await pool.destinations.delete(id);

    return result.kind === "refused"
      ? json(
          errorBody(result.refusal),
          destinationDeletionStatus(result.refusal),
        )
      : new Response(null, { status: 204 });
  };
}
