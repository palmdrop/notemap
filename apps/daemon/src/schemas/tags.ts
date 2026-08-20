import "@hono/zod-openapi";
import { z } from "zod";

export const tagRequestSchema = z
  .strictObject({ tag: z.string() })
  .openapi("TagRequest");

export const tagUseSchema = z
  .object({
    name: z.string(),
    /** Items carrying it. A superseded one is not among them. */
    items: z.number().int().positive(),
    lastUsedAt: z.string(),
  })
  .openapi("TagUse");

export const tagsInUseSchema = z
  .object({ values: z.array(tagUseSchema) })
  .openapi("TagsInUse");
