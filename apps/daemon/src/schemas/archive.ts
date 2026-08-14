import "@hono/zod-openapi";
import { z } from "zod";

/** Strict, and both bodies optional: a client with nothing to say sends nothing. */
export const archiveRequestSchema = z
  .strictObject({ reason: z.string().min(1).optional() })
  .openapi("ArchiveRequest");

export const unarchiveRequestSchema = z
  .strictObject({})
  .openapi("UnarchiveRequest");
