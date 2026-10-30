import type { Context } from "hono";

import type {
  ArchiveRefusal,
  BatchId,
  Item,
  ItemId,
  Pool,
  RoutingRecordId,
  RoutingTemplate,
  TagName,
} from "@notemap/core";

import { MAX_BATCH } from "../constants";
import { errorBody } from "../errors/refusals";
import { batchRequestSchema, cancelManyRequestSchema } from "../schemas/batch";
import type { ErrorBody } from "../types";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";

type Changed = "tagged" | "untagged" | "archived" | "unarchived" | "skipped";

type Outcome =
  | {
      readonly id: ItemId;
      readonly outcome: "reserved";
      readonly record: RoutingRecordId;
      readonly item: Item;
    }
  | { readonly id: ItemId; readonly outcome: Changed; readonly item: Item }
  | {
      readonly id: ItemId;
      readonly outcome: "refused";
      readonly error: ErrorBody["error"];
    };

const PERSON = { kind: "person" } as const;

function refusedWith(id: ItemId, refusal: Parameters<typeof errorBody>[0]) {
  return { id, outcome: "refused", error: errorBody(refusal).error } as const;
}

/**
 * Each item is tagged, untagged, archived or unarchived on its own, in the
 * order given, and lands or is refused on its own. A batch that stops halfway
 * has done half, and sending it again does the rest: what already landed
 * answers as it stands.
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

    // A tag that applies a template answers the reservation it holds, which is
    // what calling the batch off cancels.
    const template =
      action.kind === "tag"
        ? (await pool.templates.list()).find(
            (one) => one.triggerTag === action.tag.trim(),
          )
        : undefined;

    const values: Outcome[] = [];
    for (const id of items) {
      values.push(
        action.kind === "tag"
          ? await tagged(pool, id, batch, action, template)
          : action.kind === "untag"
            ? await untagged(pool, id, batch, action.tag as TagName)
            : action.kind === "archive"
              ? await archived(pool, id, batch, action.reason)
              : await unarchived(pool, id, batch),
      );
    }

    return json({ batch, values }, 200);
  };
}

const carries = (item: Item | undefined, tag: string) =>
  item?.tags.some((held) => held.name === tag.trim()) ?? false;

async function tagged(
  pool: Pool,
  id: ItemId,
  batch: BatchId,
  action: {
    readonly tag: string;
    readonly arguments?: Readonly<Record<string, string>> | undefined;
  },
  template: RoutingTemplate | undefined,
): Promise<Outcome> {
  const carried = carries(await pool.items.get(id), action.tag);
  const result = await pool.items.tag(id, action.tag as TagName, PERSON, {
    batch,
    ...(action.arguments === undefined ? {} : { arguments: action.arguments }),
  });
  if (result.kind === "refused") return refusedWith(id, result.refusal);

  if (template === undefined) {
    return { id, outcome: carried ? "skipped" : "tagged", item: result.value };
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

async function untagged(
  pool: Pool,
  id: ItemId,
  batch: BatchId,
  tag: TagName,
): Promise<Outcome> {
  const carried = carries(await pool.items.get(id), tag);
  const result = await pool.items.untag(id, tag, PERSON, batch);
  if (result.kind === "refused") return refusedWith(id, result.refusal);
  return { id, outcome: carried ? "untagged" : "skipped", item: result.value };
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
  return settledAlready(pool, id, result.refusal, "already-archived");
}

async function unarchived(
  pool: Pool,
  id: ItemId,
  batch: BatchId,
): Promise<Outcome> {
  const result = await pool.items.unarchive(id, batch);
  if (result.kind === "ok") {
    return { id, outcome: "unarchived", item: result.value };
  }
  return settledAlready(pool, id, result.refusal, "not-archived");
}

/** Already as asked is what a resent batch finds, and nothing about it changed. */
async function settledAlready(
  pool: Pool,
  id: ItemId,
  refusal: ArchiveRefusal,
  already: ArchiveRefusal["kind"],
): Promise<Outcome> {
  if (refusal.kind === already) {
    const item = await pool.items.get(id);
    if (item !== undefined) return { id, outcome: "skipped", item };
  }
  return refusedWith(id, refusal);
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
