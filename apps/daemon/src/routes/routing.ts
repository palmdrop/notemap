import type { Context } from "hono";

import type {
  CapabilityName,
  DestinationId,
  ItemId,
  JsonObject,
  Pool,
  PreviewReport,
  RoutingRecordId,
} from "@notemap/core";

import {
  cancelStatus,
  deliveryStatus,
  errorBody,
  outputStatus,
  routingStatus,
} from "../errors/refusals";
import {
  markProcessedRequestSchema,
  routeRequestSchema,
} from "../schemas/routing";
import { contentDisposition } from "../assets/content-disposition";
import { MAX_PREVIEW_BYTES } from "../constants";
import { dispositionFor, essence } from "../assets/disposition";
import { readBody } from "../utils/body";
import { json, refuse } from "../utils/responses";
import { webStream } from "../utils/stream";

/**
 * An output has no filename of its own — nothing named it, and the record is
 * what it belongs to. The extension is what a download needs to open sensibly,
 * and an unknown media type gets none rather than a guessed one.
 */
const EXTENSIONS: Readonly<Record<string, string>> = {
  "text/markdown": ".md",
  "text/plain": ".txt",
  "application/json": ".json",
};

function outputFilename(record: RoutingRecordId, mediaType: string): string {
  return `${record}${EXTENSIONS[essence(mediaType)] ?? ""}`;
}

export function markProcessedHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, markProcessedRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = context.req.param("id") ?? "";
    const result = await pool.routing.markProcessed(
      id as ItemId,
      body.value.note,
    );

    return result.kind === "refused"
      ? json(errorBody(result.refusal), routingStatus(result.refusal))
      : json(result.value, 200);
  };
}

export function routingRecordsHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = context.req.param("id") ?? "";

    // Unlike the action log, this is the item's own state and goes when it
    // does, so an empty list for an unknown id would be a claim about an item.
    if ((await pool.items.get(id as ItemId)) === undefined) {
      return refuse({ kind: "no-such-item", item: id });
    }

    return json({ values: await pool.routing.recordsFor(id as ItemId) }, 200);
  };
}

/**
 * A decision, and one delivery attempt inline. The `200` may carry a record
 * that has not landed — a destination that could not be reached leaves it
 * pending — so a client reads `state` rather than reading a record as arrival.
 */
export function routeHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, routeRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = context.req.param("id") ?? "";
    const result = await pool.routing.route(id as ItemId, {
      destination: body.value.destination as DestinationId,
      capability: body.value.capability as CapabilityName,
      arguments: body.value.arguments as JsonObject,
    });

    return result.kind === "refused"
      ? json(errorBody(result.refusal), deliveryStatus(result.refusal))
      : json(result.value, 200);
  };
}

/**
 * What the destination says it would write, answered rather than written: this
 * `POST` reserves nothing, appends nothing and touches nothing at the
 * destination beyond whatever it had to read to answer.
 */
export function previewHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const body = await readBody(context, routeRequestSchema);
    if (!body.ok) return refuse(body.refusal);

    const id = context.req.param("id") ?? "";
    const result = await pool.routing.preview(
      id as ItemId,
      {
        destination: body.value.destination as DestinationId,
        capability: body.value.capability as CapabilityName,
        arguments: body.value.arguments as JsonObject,
      },
      context.req.raw.signal,
    );

    if (result.kind === "refused") {
      return json(errorBody(result.refusal), deliveryStatus(result.refusal));
    }

    const report = result.value;
    return json(
      report.kind === "previewed" ? await readable(report) : report,
      200,
    );
  };
}

/**
 * The bytes, in the answer rather than behind a second fetch: a preview is
 * stored nowhere, so there is nothing to hand out a URL to. Text only, because
 * this is JSON and because a preview is something a person reads.
 */
async function readable(report: PreviewReport & { kind: "previewed" }) {
  const { content, note } = report;
  const said = note === undefined ? {} : { note };

  if (content === undefined) return { kind: "previewed" as const, ...said };

  const read = TEXTUAL.test(essence(content.mediaType))
    ? await take(await content.open(), MAX_PREVIEW_BYTES)
    : undefined;

  return {
    kind: "previewed" as const,
    content: {
      mediaType: content.mediaType,
      ...(read === undefined ? {} : { text: read.text }),
      truncated: read?.truncated ?? false,
    },
    ...said,
  };
}

/** What can be put in a JSON string honestly. Anything else says what it is and nothing more. */
const TEXTUAL = /^text\/|^application\/(json|xml|yaml)$|\+(json|xml)$/;

async function take(
  bytes: AsyncIterable<Uint8Array>,
  limit: number,
): Promise<{ text: string; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;

  for await (const chunk of bytes) {
    if (size + chunk.byteLength > limit) {
      chunks.push(chunk.subarray(0, limit - size));
      truncated = true;
      break;
    }
    chunks.push(chunk);
    size += chunk.byteLength;
  }

  const joined = new Uint8Array(size + (truncated ? limit - size : 0));
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }

  return { text: new TextDecoder().decode(joined), truncated };
}

/**
 * The bytes a delivery produced, on the same inert terms an asset's bytes are
 * served: this is content a destination wrote, coming back from the daemon's
 * own origin.
 */
export function routingOutputHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const record = (context.req.param("record") ?? "") as RoutingRecordId;
    const opened = await pool.routing.openOutput(
      record,
      context.req.raw.signal,
    );

    if (opened.kind === "refused") {
      return json(errorBody(opened.refusal), outputStatus(opened.refusal));
    }

    const { blob, mediaType, bytes } = opened.value;

    // No `Content-Length`, on the asset read's own reasoning: it would come
    // from the row, and nothing rehashes on the way out.
    return new Response(webStream(bytes), {
      status: 200,
      headers: {
        "content-type": mediaType,
        "content-disposition": contentDisposition(
          dispositionFor(mediaType),
          outputFilename(record, mediaType),
        ),
        // A delivered record never changes what it produced.
        etag: `"${blob}"`,
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  };
}

/** `204`: the reservation is gone and the item is back in the queue, so there is nothing to answer with. */
export function cancelDeliveryHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const record = context.req.param("record") ?? "";
    const result = await pool.routing.cancelDelivery(record as RoutingRecordId);

    return result.kind === "refused"
      ? json(errorBody(result.refusal), cancelStatus(result.refusal))
      : new Response(null, { status: 204 });
  };
}
