import "@hono/zod-openapi";
import { z } from "zod";

import { jsonObject } from "./json";
import { capabilitySchema } from "./routing";

export const destinationSchema = z
  .object({
    id: z.string(),
    /** A person's label. Free text, and not unique: a record names the id. */
    name: z.string(),
    kind: z.string(),
    /** The kind's own, and opaque to `/v1`: it satisfies that kind's `settingsSchema`. */
    settings: jsonObject,
    /** Retired ones are listed. A client shows them as not offered rather than hiding them. */
    retired: z.boolean(),
  })
  .openapi("Destination");

export const destinationsSchema = z
  .object({ values: z.array(destinationSchema) })
  .openapi("Destinations");

export const destinationDescriptionSchema = z
  .union([
    z.object({
      kind: z.literal("described"),
      capabilities: z.array(capabilitySchema),
    }),
    z.object({
      kind: z.literal("undescribable"),
      /** It went and looked and could not say. It is still there. */
      detail: z.string(),
    }),
    z.object({
      kind: z.literal("unusable"),
      /** No adapter speaks its kind, or its settings no longer satisfy that kind. */
      detail: z.string(),
    }),
  ])
  .openapi("DestinationDescription");

export const candidateEntrySchema = z
  .object({
    label: z.string(),
    /** Absent where this is only somewhere to look further. */
    value: z.unknown().optional(),
    /** Absent where the destination has nothing further to offer past this entry. */
    scope: z.string().optional(),
  })
  .openapi("CandidateEntry");

export const destinationCandidatesSchema = z
  .union([
    z.object({
      kind: z.literal("answered"),
      entries: z.array(candidateEntrySchema),
      /** True where the destination held more than it answered. */
      truncated: z.boolean(),
    }),
    z.object({
      kind: z.literal("unreachable"),
      /** It went and asked and could not say. */
      detail: z.string(),
    }),
    z.object({
      kind: z.literal("unusable"),
      /** No adapter speaks its kind, or its settings no longer satisfy that kind. */
      detail: z.string(),
    }),
    /** The kind does not do this at all. Same fact to a caller whether the adapter said so or never implemented it. */
    z.object({ kind: z.literal("not-offered") }),
  ])
  .openapi("DestinationCandidates");

export const destinationProbeSchema = z
  .union([
    /** Reached, credentials accepted, root found. Not a promise that a write will land. */
    z.object({ kind: z.literal("ready") }),
    z.object({
      kind: z.literal("rejected"),
      /** It answered and said no, which is a person's to fix. */
      detail: z.string(),
    }),
    z.object({
      kind: z.literal("unreachable"),
      /** It could not be reached, or could not decide. A retry may find it different. */
      detail: z.string(),
    }),
    z.object({
      kind: z.literal("unusable"),
      /** No adapter speaks its kind, or its settings no longer satisfy that kind. */
      detail: z.string(),
    }),
    /** The kind does not do this at all. */
    z.object({ kind: z.literal("not-offered") }),
  ])
  .openapi("DestinationProbe");

export const destinationKindSchema = z
  .object({
    name: z.string(),
    /** JSON Schema: the whole of what a client needs to build the settings form. */
    settingsSchema: jsonObject,
  })
  .openapi("DestinationKind");

export const destinationKindsSchema = z
  .object({ values: z.array(destinationKindSchema) })
  .openapi("DestinationKinds");

export const createDestinationRequestSchema = z
  .strictObject({
    name: z.string().min(1).openapi({
      description:
        "What a person calls it. Changeable, and need not be unique.",
      example: "Vault",
    }),
    kind: z.string().min(1).openapi({
      description: "One of the names `GET /v1/destination-kinds` reports.",
      example: "filesystem",
    }),
    settings: jsonObject.openapi({
      description: "Must satisfy that kind's `settingsSchema`.",
      example: { root: "~/notes" },
    }),
  })
  .openapi("CreateDestinationRequest");

export const updateDestinationRequestSchema = z
  .strictObject({
    name: z.string().min(1).optional(),
    settings: jsonObject.optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.settings !== undefined,
    "name or settings",
  )
  .openapi("UpdateDestinationRequest");
