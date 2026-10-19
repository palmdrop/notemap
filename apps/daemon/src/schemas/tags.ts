import "@hono/zod-openapi";
import { z } from "zod";

import { suppliedArgumentsSchema } from "./routing";

export const tagRequestSchema = z
  .strictObject({
    tag: z.string(),
    arguments: suppliedArgumentsSchema.optional().openapi({
      description:
        "Values for the asked arguments of the template this tag fires. Ignored where the tag fires nothing.",
    }),
  })
  .openapi("TagRequest");

export const tagUseSchema = z
  .object({
    name: z.string(),
    /** Items carrying it, archived and revised alike. */
    items: z.number().int().positive(),
    /** Of those, the ones the queue holds. */
    unprocessed: z.number().int().nonnegative(),
  })
  .openapi("TagUse");

export const tagsInUseSchema = z
  .object({ values: z.array(tagUseSchema) })
  .openapi("TagsInUse");
