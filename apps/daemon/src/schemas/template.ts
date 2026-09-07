import "@hono/zod-openapi";
import { z } from "zod";

import { jsonObject } from "./json";

/** The three a template may say. `establish` never leaves it: an adapter sees the other two. */
const folderMode = z.enum(["create", "require", "establish"]);

export const templateSchema = z
  .object({
    id: z.string(),
    /** A person's label. Free text, and not unique: a record names the id. */
    name: z.string(),
    destination: z.string(),
    capability: z.string(),
    /** Patterns until a decision is made, which is when the pool expands them. */
    arguments: jsonObject,
    folder: folderMode,
    /** Declared rather than derived, so renaming disarms no tag already written. */
    triggerTag: z.string().optional(),
    /** When the first delivery from it landed. Only `establish` reads it. */
    establishedAt: z.string().optional(),
    /** What the pool made from it: how many records name it, and when the last did. */
    fired: z.object({
      records: z.number().int().nonnegative(),
      lastAt: z.string().optional(),
    }),
  })
  .openapi("RoutingTemplate");

export const templatesSchema = z
  .object({ values: z.array(templateSchema) })
  .openapi("RoutingTemplates");

export const createTemplateRequestSchema = z
  .strictObject({
    name: z.string().min(1),
    destination: z.string().min(1),
    capability: z.string().min(1),
    arguments: jsonObject,
    folder: folderMode.optional(),
    triggerTag: z.string().min(1).optional(),
  })
  .openapi("CreateRoutingTemplateRequest");

/**
 * Every field a person may change, all optional. `triggerTag: null` takes the
 * tag off, which absent cannot say.
 */
export const updateTemplateRequestSchema = z
  .strictObject({
    name: z.string().min(1).optional(),
    destination: z.string().min(1).optional(),
    capability: z.string().min(1).optional(),
    arguments: jsonObject.optional(),
    folder: folderMode.optional(),
    triggerTag: z.string().min(1).nullable().optional(),
  })
  .openapi("UpdateRoutingTemplateRequest");

const issue = z.object({
  path: z.string(),
  keyword: z.string(),
  detail: z.string().optional(),
});

export const templateReportSchema = z
  .union([
    z.object({ kind: z.literal("fits") }),
    z.object({ kind: z.literal("stranded") }),
    z.object({ kind: z.literal("destination-retired") }),
    z.object({ kind: z.literal("destination-unusable"), detail: z.string() }),
    z.object({
      kind: z.literal("capability-undeclared"),
      capability: z.string(),
    }),
    z.object({ kind: z.literal("arguments-invalid"), issues: z.array(issue) }),
    z.object({ kind: z.literal("folder-missing"), folder: z.string() }),
    z.object({ kind: z.literal("unreachable"), detail: z.string() }),
  ])
  .openapi("RoutingTemplateReport");

export const resolvedTemplateSchema = z
  .object({
    destination: z.string(),
    capability: z.string(),
    /** Expanded: what a record made now would carry, and a place a person can read. */
    arguments: jsonObject,
  })
  .openapi("ResolvedRoutingTemplate");
