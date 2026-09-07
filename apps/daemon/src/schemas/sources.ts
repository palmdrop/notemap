import "@hono/zod-openapi";
import { z } from "zod";

export const sourceUseSchema = z
  .object({
    id: z.string(),
    /** Items it captured, archived and revised alike. */
    items: z.number().int().positive(),
    /** The capture time of the newest of them, never the time it arrived. */
    lastCapturedAt: z.string(),
  })
  .openapi("SourceUse");

export const sourcesInUseSchema = z
  .object({ values: z.array(sourceUseSchema) })
  .openapi("SourcesInUse");
