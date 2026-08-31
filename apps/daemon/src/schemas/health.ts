import "@hono/zod-openapi";
import { z } from "zod";

export const healthSchema = z
  .object({
    /** Absent to a caller outside the door, where liveness is all this answers. */
    pool: z
      .string()
      .optional()
      .openapi({ example: "a1c9f2e4-6b30-4d51-9e7a-2f8b40c1d6e3" }),
    version: z.string().openapi({ example: "0.2.0" }),
  })
  .openapi("Health");
