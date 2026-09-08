import type { Context } from "hono";

import type {
  CandidatesRequest,
  CapabilityName,
  Destination,
  DestinationId,
  DestinationKindName,
  JsonObject,
  JsonSchema,
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

/**
 * How long a call that reaches the outside world is given. The delivery runner
 * bounds its own attempts; these three are asked by a person waiting on an
 * answer, and without a deadline an address that swallows packets holds the
 * request open for however long the runtime's own defaults happen to be.
 *
 * Generous rather than snappy: a vault on a slow mount is not a failure, and
 * what this is really for is the case that would never answer at all.
 */
const REACH_DEADLINE_MS = 20_000;

const reaching = (): AbortSignal => AbortSignal.timeout(REACH_DEADLINE_MS);

/** A read of pool state: it answers at once, cannot fail, and probes nothing. */
export function destinationsHandler(pool: Pool) {
  return async (): Promise<Response> =>
    json({ values: (await pool.destinations.list()).map(declared) }, 200);
}

export function destinationKindsHandler(pool: Pool) {
  return (): Response => json({ values: pool.destinations.kinds() }, 200);
}

/** Reaches the destination, so it is one of the three that can hang. */
export function destinationDescriptionHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = (context.req.param("id") ?? "") as DestinationId;
    const report = await pool.destinations.describe(id, reaching());

    return report === undefined
      ? json(errorBody({ kind: "unknown-destination", destination: id }), 404)
      : json(report, 200);
  };
}

export function destinationProbeHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = (context.req.param("id") ?? "") as DestinationId;
    const report = await pool.destinations.probe(id, reaching());

    return report === undefined
      ? json(errorBody({ kind: "unknown-destination", destination: id }), 404)
      : json(report, 200);
  };
}

/** What a field's own schema carries when a person may browse it rather than type it. */
const CANDIDATES_KEYWORD = "x-notemap-candidates";

function askable(schema: JsonSchema, field: string): boolean {
  const properties = schema["properties"];
  if (
    properties === null ||
    typeof properties !== "object" ||
    Array.isArray(properties)
  ) {
    return false;
  }

  const property = (properties as Record<string, unknown>)[field];
  if (property === null || typeof property !== "object") return false;

  return (property as Record<string, unknown>)[CANDIDATES_KEYWORD] === true;
}

/**
 * The same animal as `/description`: a question the destination answers,
 * slowly, and may refuse. The capability and the field are checked here,
 * before the destination is asked anything — the same shape `POST
 * /v1/items/{id}/route` refuses an undeclared capability with, on this
 * route's own terms rather than core's, since the port takes neither request
 * on faith.
 */
export function destinationCandidatesHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = (context.req.param("id") ?? "") as DestinationId;
    const capability = (context.req.query("capability") ??
      "") as CapabilityName;
    const field = context.req.query("field") ?? "";
    const scope = context.req.query("scope");

    const description = await pool.destinations.describe(id, reaching());
    if (description === undefined) {
      return json(
        errorBody({ kind: "unknown-destination", destination: id }),
        404,
      );
    }
    if (description.kind === "undescribable") {
      return json({ kind: "unreachable", detail: description.detail }, 200);
    }
    if (description.kind === "unusable") {
      return json(description, 200);
    }

    const declared = description.capabilities.find(
      (each) => each.name === capability,
    );
    if (declared === undefined) {
      return refuse({ kind: "capability-undeclared", capability });
    }
    if (!askable(declared.argumentsSchema, field)) {
      return refuse({ kind: "field-not-askable", capability, field });
    }

    const request: CandidatesRequest = {
      capability,
      field,
      ...(scope === undefined ? {} : { scope }),
    };
    const report = await pool.destinations.candidates(id, request, reaching());

    return report === undefined
      ? json(errorBody({ kind: "unknown-destination", destination: id }), 404)
      : json(report, 200);
  };
}

/**
 * The other side of `/candidates`, and deliberately not its shape: nothing is
 * asked of the destination, so there is no describe to do first, no capability
 * to check against what it declares, and no `x-notemap-candidates` to require.
 * A capability nothing was routed with, or a field no record carries, has no
 * places — which is a true answer rather than a refusal, and answering it
 * without touching the destination is exactly what makes this usable when the
 * vault is not there.
 */
export function destinationRememberedHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = (context.req.param("id") ?? "") as DestinationId;
    const capability = (context.req.query("capability") ??
      "") as CapabilityName;
    const field = context.req.query("field") ?? "";

    const answer = await pool.destinations.remembered(id, {
      capability,
      field,
    });

    return answer === undefined
      ? json(errorBody({ kind: "unknown-destination", destination: id }), 404)
      : json(answer, 200);
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
