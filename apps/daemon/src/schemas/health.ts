import "@hono/zod-openapi";
import { z } from "zod";

export const healthSchema = z
  .object({
    /** Which pool this daemon holds. Opaque, and stable for that pool's life. */
    pool: z
      .string()
      .openapi({ example: "0198f0c2-0000-7000-8000-000000000000" }),
  })
  .openapi("Health");
