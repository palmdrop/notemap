import type { Context } from "hono";

import type {
  CapabilityName,
  DestinationId,
  ItemId,
  JsonObject,
  Pool,
  RoutingTemplate,
  RoutingTemplateId,
  TagName,
} from "@notemap/core";

import { errorBody, templateStatus } from "../errors/refusals";
import {
  createTemplateRequestSchema,
  updateTemplateRequestSchema,
} from "../schemas/template";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

/** What a template is on the wire, which is what it is in the pool. */
function declared(template: RoutingTemplate) {
  return {
    id: template.id,
    name: template.name,
    destination: template.destination,
    capability: template.capability,
    arguments: template.arguments,
    folder: template.folder,
    ...(template.triggerTag === undefined
      ? {}
      : { triggerTag: template.triggerTag }),
    ...(template.establishedAt === undefined
      ? {}
      : { establishedAt: template.establishedAt }),
    fired: template.fired,
  };
}

/** A read of pool state: it answers at once, cannot fail, and asks nothing. */
export function templatesHandler(pool: Pool) {
  return async (): Promise<Response> =>
    json({ values: (await pool.templates.list()).map(declared) }, 200);
}

export function createTemplateHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, createTemplateRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const { name, destination, capability, folder, triggerTag } = body.value;
    const created = await pool.templates.create({
      name,
      destination: destination as DestinationId,
      capability: capability as CapabilityName,
      arguments: body.value.arguments as JsonObject,
      ...(folder === undefined ? {} : { folder }),
      ...(triggerTag === undefined
        ? {}
        : { triggerTag: triggerTag as TagName }),
    });

    return created.kind === "refused"
      ? json(errorBody(created.refusal), templateStatus(created.refusal))
      : json(declared(created.value), 201, {
          location: `/v1/templates/${created.value.id}`,
        });
  };
}

export function updateTemplateHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, updateTemplateRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = (context.req.param("id") ?? "") as RoutingTemplateId;
    const { name, destination, capability, folder, triggerTag } = body.value;

    const edited = await pool.templates.edit(id, {
      ...(name === undefined ? {} : { name }),
      ...(destination === undefined
        ? {}
        : { destination: destination as DestinationId }),
      ...(capability === undefined
        ? {}
        : { capability: capability as CapabilityName }),
      ...(body.value.arguments === undefined
        ? {}
        : { arguments: body.value.arguments as JsonObject }),
      ...(folder === undefined ? {} : { folder }),
      // `null` is the one thing absence cannot say: take the tag off.
      ...(triggerTag === undefined
        ? {}
        : { triggerTag: triggerTag === null ? null : (triggerTag as TagName) }),
    });

    return edited.kind === "refused"
      ? json(errorBody(edited.refusal), templateStatus(edited.refusal))
      : json(declared(edited.value), 200);
  };
}

/** `204`: the row is gone, so there is nothing to answer with. */
export function deleteTemplateHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = (context.req.param("id") ?? "") as RoutingTemplateId;
    const result = await pool.templates.delete(id);

    return result.kind === "refused"
      ? json(errorBody(result.refusal), templateStatus(result.refusal))
      : new Response(null, { status: 204 });
  };
}

/** The one call here that reaches the outside world, and so the one that can hang. */
export function templateReportHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = (context.req.param("id") ?? "") as RoutingTemplateId;
    const report = await pool.templates.report(id, context.req.raw.signal);

    return report === undefined
      ? json(errorBody({ kind: "unknown-template", template: id }), 404)
      : json(report, 200);
  };
}

/**
 * What a template would route this item as, reserving nothing. A different
 * question from a preview, which answers bytes.
 */
export function resolveTemplateHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const item = (context.req.param("id") ?? "") as ItemId;
    const template = (context.req.query("template") ?? "") as RoutingTemplateId;

    const resolved = await pool.templates.resolve(item, template);
    if (resolved !== undefined) return json(resolved, 200);

    return (await pool.templates.get(template)) === undefined
      ? json(errorBody({ kind: "unknown-template", template }), 404)
      : json(errorBody({ kind: "no-such-item", item }), 404);
  };
}
