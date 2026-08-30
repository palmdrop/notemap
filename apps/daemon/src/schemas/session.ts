import "@hono/zod-openapi";
import { z } from "zod";

export const loginRequestSchema = z
  .object({
    name: z.string().min(1).openapi({ example: "anton" }),
    password: z.string().min(1).openapi({ example: "correct horse battery staple" }),
  })
  .openapi("LoginRequest");

/**
 * Answered whether or not anyone is signed in, which is why `authenticated` is
 * a field rather than a status: a daemon with no credential set is open, and a
 * client has to be able to tell that from being turned away.
 */
export const sessionSchema = z
  .object({
    authenticated: z.boolean().openapi({ example: true }),
    /** False on a daemon nobody has set a password on, where every request is let through. */
    requiresCredentials: z.boolean().openapi({ example: true }),
    identity: z
      .object({
        kind: z.enum(["session", "token"]).openapi({ example: "session" }),
        id: z.string().openapi({ example: "gpeukvybsmmgwnec" }),
        name: z.string().optional().openapi({ example: "laptop" }),
      })
      .optional(),
  })
  .openapi("Session");
