import "@hono/zod-openapi";
import { z } from "zod";

export const countsSchema = z
  .object({
    /** Every item the queue holds. */
    queue: z.number().int().nonnegative(),
  })
  .openapi("Counts");
