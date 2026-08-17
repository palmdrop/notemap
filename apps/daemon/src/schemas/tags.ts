import "@hono/zod-openapi";
import { z } from "zod";

export const tagRequestSchema = z
  .strictObject({ tag: z.string() })
  .openapi("TagRequest");
