import "@hono/zod-openapi";
import { z } from "zod";

export const tagRequestSchema = z
  .strictObject({ tag: z.string().trim().min(1) })
  .openapi("TagRequest");
