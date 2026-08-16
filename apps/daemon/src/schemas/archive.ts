import "@hono/zod-openapi";
import { z } from "zod";

export const archiveRequestSchema = z
  .strictObject({ reason: z.string().min(1).optional() })
  .openapi("ArchiveRequest");

export const unarchiveRequestSchema = z
  .strictObject({})
  .openapi("UnarchiveRequest");
