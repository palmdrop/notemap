import "@hono/zod-openapi";
import { z } from "zod";

import { MAX_BATCH } from "../constants";
import { itemSchema } from "./item";
import { suppliedArgumentsSchema } from "./routing";

const templateAction = z
  .strictObject({
    kind: z.literal("template"),
    template: z.string().min(1),
    arguments: suppliedArgumentsSchema.optional(),
  })
  .openapi("BatchTemplateAction", {
    description:
      "Applies the template to each item by tagging it with the template's trigger tag.",
  });

const archiveAction = z
  .strictObject({
    kind: z.literal("archive"),
    reason: z.string().min(1).optional(),
  })
  .openapi("BatchArchiveAction");

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
    action: z.discriminatedUnion("kind", [templateAction, archiveAction]),
  })
  .openapi("BatchRequest");

const error = z.looseObject({ code: z.string() }).openapi({
  description: "The refusal the item met, as its own route would answer it.",
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
      outcome: z.literal("archived"),
      item: itemSchema,
    }),
    z.object({
      id: z.string(),
      outcome: z.literal("skipped"),
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
