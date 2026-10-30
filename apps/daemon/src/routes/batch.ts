import type { Context } from "hono";

import type {
  BatchId,
  Item,
  ItemId,
  Pool,
  RoutingRecordId,
  RoutingTemplate,
  RoutingTemplateId,
  TagName,
} from "@notemap/core";

import { MAX_BATCH } from "../constants";
import { errorBody } from "../errors/refusals";
import { batchRequestSchema, cancelManyRequestSchema } from "../schemas/batch";
import type { ErrorBody } from "../types";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

type Outcome =
  | {
      readonly id: ItemId;
      readonly outcome: "reserved";
      readonly record: RoutingRecordId;
      readonly item: Item;
    }
  | {
      readonly id: ItemId;
      readonly outcome: "archived" | "skipped";
      readonly item: Item;
    }
  | {
      readonly id: ItemId;
      readonly outcome: "refused";
      readonly error: ErrorBody["error"];
    };

const PERSON = { kind: "person" } as const;

/**
 * Each item is tagged or archived on its own, in the order given, and lands or
 * is refused on its own. A batch that stops halfway has done half, and sending
 * it again does the rest: what already landed answers as it stands.
 */
export function batchHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, batchRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const { action } = body.value;
    const batch = body.value.batch as BatchId;
    const items = [...new Set(body.value.items)] as ItemId[];
    if (items.length > MAX_BATCH) {
      return refuse({
        kind: "limit-too-large",
        limit: items.length,
        max: MAX_BATCH,
      });
    }

    const values: Outcome[] = [];
    if (action.kind === "archive") {
      for (const id of items) {
        values.push(await archived(pool, id, batch, action.reason));
      }
      return json({ batch, values }, 200);
    }

    const template = await pool.templates.get(
      action.template as RoutingTemplateId,
    );
    if (template === undefined) {
      return refuse({ kind: "unknown-template", template: action.template });
    }
    const tag = template.triggerTag;
    if (tag === undefined) {
      return refuse({
        kind: "template-untriggered",
        template: action.template,
      });
    }

    for (const id of items) {
      values.push(
        await applied(pool, id, batch, template, tag, action.arguments),
      );
    }

    return json({ batch, values }, 200);
  };
}

async function applied(
  pool: Pool,
  id: ItemId,
  batch: BatchId,
  template: RoutingTemplate,
  tag: TagName,
  supplied: Readonly<Record<string, string>> | undefined,
): Promise<Outcome> {
  const result = await pool.items.tag(id, tag, PERSON, {
    batch,
    ...(supplied === undefined ? {} : { arguments: supplied }),
  });
  if (result.kind === "refused") {
    return { id, outcome: "refused", error: errorBody(result.refusal).error };
  }

  const reservation = (await pool.routing.recordsFor(id)).find(
    (record) =>
      record.state === "pending" &&
      record.applied?.template === template.id &&
      record.applied.firedByTag,
  );

  return reservation === undefined
    ? { id, outcome: "skipped", item: result.value }
    : {
        id,
        outcome: "reserved",
        record: reservation.id,
        item: result.value,
      };
}

async function archived(
  pool: Pool,
  id: ItemId,
  batch: BatchId,
  reason: string | undefined,
): Promise<Outcome> {
  const result = await pool.items.archive(id, reason, batch);
  if (result.kind === "ok") {
    return { id, outcome: "archived", item: result.value };
  }

  // Already archived is what a resent batch finds, and nothing about it changed.
  if (result.refusal.kind === "already-archived") {
    const item = await pool.items.get(id);
    if (item !== undefined) return { id, outcome: "skipped", item };
  }
  return { id, outcome: "refused", error: errorBody(result.refusal).error };
}

export function cancelManyHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, cancelManyRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const records = new Set(body.value.records);
    if (records.size > MAX_BATCH) {
      return refuse({
        kind: "limit-too-large",
        limit: records.size,
        max: MAX_BATCH,
      });
    }

    const values = [];
    for (const record of records) {
      const result = await pool.routing.cancelDelivery(
        record as RoutingRecordId,
      );
      values.push(
        result.kind === "ok"
          ? { record, outcome: "cancelled" as const }
          : {
              record,
              outcome: "refused" as const,
              error: errorBody(result.refusal).error,
            },
      );
    }

    return json({ values }, 200);
  };
}
