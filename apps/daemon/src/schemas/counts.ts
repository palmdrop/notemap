import "@hono/zod-openapi";
import { z } from "zod";

export const countsSchema = z
  .object({
    /** Every item the queue holds. */
    queue: z.number().int().nonnegative(),
    /** Every item captured at or after `since`, answered only where it was asked. */
    captured: z.number().int().nonnegative().optional(),
  })
  .openapi("Counts");
