import "@hono/zod-openapi";
import { z } from "zod";

import { MAX_BATCH } from "../constants";
import { itemSchema } from "./item";
import { suppliedArgumentsSchema } from "./routing";

const tagAction = z
  .strictObject({
    kind: z.literal("tag"),
    tag: z.string(),
    arguments: suppliedArgumentsSchema.optional().openapi({
      description:
        "Values for the asked arguments of the template the tag applies, the same for every item. Ignored where it applies none.",
    }),
  })
  .openapi("BatchTagAction", {
    description:
      "Adds the tag to each item. A trigger tag applies its template to each.",
  });

const untagAction = z
  .strictObject({ kind: z.literal("untag"), tag: z.string() })
  .openapi("BatchUntagAction");

const archiveAction = z
  .strictObject({
    kind: z.literal("archive"),
    reason: z.string().min(1).optional(),
  })
  .openapi("BatchArchiveAction");

const unarchiveAction = z
  .strictObject({ kind: z.literal("unarchive") })
  .openapi("BatchUnarchiveAction");

export const batchRequestSchema = z
  .strictObject({
    batch: z.string().min(1).openapi({
      description:
        "The batch's id, made by the client. Every log entry the batch writes carries it, and a resend carries the same one.",
    }),
    items: z
      .array(z.string().min(1))
      .min(1)
      .openapi({
        description: `At most ${MAX_BATCH}, and an id named twice is acted on once.`,
      }),
    action: z.discriminatedUnion("kind", [
      tagAction,
      untagAction,
      archiveAction,
      unarchiveAction,
    ]),
  })
  .openapi("BatchRequest");

const error = z.looseObject({ code: z.string() }).openapi({
  description: "The refusal, as the single route would have answered it.",
});

export const batchOutcomeSchema = z
  .discriminatedUnion("outcome", [
    z.object({
      id: z.string(),
      outcome: z.literal("reserved"),
      record: z.string().openapi({
        description:
          "The reservation the template's trigger tag holds on the item, which cancelling calls off.",
      }),
      item: itemSchema,
    }),
    z.object({
      id: z.string(),
      outcome: z.enum(["tagged", "untagged", "archived", "unarchived"]),
      item: itemSchema,
    }),
    z.object({
      id: z.string(),
      outcome: z.literal("skipped").openapi({
        description:
          "Nothing changed: the item was already as asked, or the template had already filed it.",
      }),
      item: itemSchema,
    }),
    z.object({
      id: z.string(),
      outcome: z.literal("refused"),
      error,
    }),
  ])
  .openapi("BatchOutcome");

export const batchAnswerSchema = z
  .object({
    batch: z.string(),
    values: z.array(batchOutcomeSchema),
  })
  .openapi("BatchAnswer");

export const cancelManyRequestSchema = z
  .strictObject({
    records: z
      .array(z.string().min(1))
      .min(1)
      .openapi({ description: `At most ${MAX_BATCH}.` }),
  })
  .openapi("CancelManyRequest");

export const cancelManyAnswerSchema = z
  .object({
    values: z.array(
      z.discriminatedUnion("outcome", [
        z.object({ record: z.string(), outcome: z.literal("cancelled") }),
        z.object({
          record: z.string(),
          outcome: z.literal("refused"),
          error,
        }),
      ]),
    ),
  })
  .openapi("CancelManyAnswer");
