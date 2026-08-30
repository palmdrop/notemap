import "@hono/zod-openapi";
import { z } from "zod";

import { instant } from "./timestamp";

export const tokenSchema = z
  .object({
    id: z.string().openapi({ example: "gpeukvybsmmgwnec" }),
    name: z.string().openapi({ example: "laptop" }),
    createdAt: z.string().openapi({ example: "2026-08-30T09:00:00.000Z" }),
    expiresAt: z
      .string()
      .optional()
      .openapi({ example: "2026-11-30T09:00:00.000Z" }),
    lastUsedAt: z
      .string()
      .optional()
      .openapi({ example: "2026-08-31T14:12:00.000Z" }),
  })
  .openapi("Token");

export const tokensSchema = z
  .object({ values: z.array(tokenSchema) })
  .openapi("Tokens");

export const mintTokenRequestSchema = z
  .object({
    name: z.string().min(1).openapi({ example: "laptop" }),
    expiresAt: instant
      .optional()
      .openapi({ example: "2026-11-30T09:00:00.000Z" }),
  })
  .openapi("MintTokenRequest");

/** The one answer carrying `token`. It is not stored and cannot be read back. */
export const mintedTokenSchema = tokenSchema
  .extend({
    token: z.string().openapi({ example: "nmp.gpeukvybsmmgwnec.qK9v..." }),
  })
  .openapi("MintedToken");
