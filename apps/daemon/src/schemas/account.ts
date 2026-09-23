import "@hono/zod-openapi";
import { z } from "zod";

import { jsonObject } from "./json";

export const accountSchema = z
  .object({
    kind: z.string().openapi({ example: "webdav" }),
    name: z.string().openapi({ example: "nextcloud" }),
    fields: jsonObject.openapi({
      description:
        "What the kind asks an account to carry besides its secret. Never the secret, and never where it is read from.",
      example: {
        baseUrl: "https://cloud.example/remote.php/dav/files/alice",
        username: "alice",
      },
    }),
    from: z.enum(["config", "stored"]).openapi({
      description:
        "`config` is declared under `[[accounts]]`; `stored` is held by the daemon and set over this API.",
    }),
    shadowed: z.boolean().openapi({
      description:
        "A config account a stored one of the same kind and name replaces entirely. Listed so it is not silently dropped; never used.",
    }),
    secretSet: z.boolean().openapi({
      description:
        "Whether a secret could be presented now: always for a stored account, and for a config one whether its file or variable can be read.",
    }),
    changedAt: z.string().optional().openapi({
      description: "When a stored account was last written.",
      example: "2026-09-23T09:00:00.000Z",
    }),
  })
  .openapi("Account");

export const accountsSchema = z
  .object({ values: z.array(accountSchema) })
  .openapi("Accounts");

export const accountKindSchema = z
  .object({
    name: z.string(),
    /** JSON Schema: the whole of what a client needs to build the account form, secret aside. */
    accountSchema: jsonObject,
  })
  .openapi("AccountKind");

export const accountKindsSchema = z
  .object({ values: z.array(accountKindSchema) })
  .openapi("AccountKinds");

export const putAccountRequestSchema = z
  .strictObject({
    fields: jsonObject.openapi({
      description: "Must satisfy the kind's `accountSchema`.",
    }),
    secret: z.string().min(1).optional().openapi({
      description:
        "The password or token presented to the other system. Required to create; left out on a replacement, the secret already held is kept.",
    }),
  })
  .openapi("PutAccountRequest");

export const removedAccountSchema = z
  .object({
    revealed: accountSchema.optional().openapi({
      description:
        "The config account of the same kind and name, now in use again. Absent where there is none.",
    }),
  })
  .openapi("RemovedAccount");
