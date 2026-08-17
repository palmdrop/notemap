import "@hono/zod-openapi";
import { z } from "zod";

/**
 * Both halves take the tag in the body rather than in the path. Namespacing is
 * convention rather than structure, so `project/fiction-a` is one tag with a
 * slash in it — which a path segment cannot carry without an encoding every
 * layer between the client and the route has to agree to leave alone.
 */
export const tagRequestSchema = z
  .strictObject({ tag: z.string().min(1) })
  .openapi("TagRequest");
