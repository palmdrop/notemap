import type { Context } from "hono";

import type {
  AssetId,
  AssetOutcome,
  AssetStoreRefusal,
  Pool,
  Result,
} from "@notemap/core";

import {
  contentDisposition,
  filenameFrom,
} from "../assets/content-disposition";
import { dispositionFor } from "../assets/disposition";
import { claimedDigest } from "../assets/repr-digest";
import { guarded, type UploadLimits } from "../assets/upload";
import { assetStatus, assetStoreStatus, errorBody } from "../errors/refusals";
import { RefusedUpload } from "../errors/refused-upload";
import { json, refuse } from "../utils/responses";

export type { UploadLimits };

export function assetUploadHandler(pool: Pool, limits: UploadLimits) {
  return async (context: Context): Promise<Response> => {
    const mime = context.req.header("content-type")?.trim() ?? "";
    if (mime === "") {
      return refuse({ kind: "unsupported-media-type", contentType: mime });
    }

    const filename = filenameFrom(context.req.header("content-disposition"));
    if (filename === undefined) return refuse({ kind: "missing-filename" });

    const header = context.req.header("repr-digest");
    const claimed = claimedDigest(header);
    if (claimed.kind === "unreadable") {
      return refuse({ kind: "bad-digest", digest: header ?? "" });
    }

    const id = (context.req.param("id") ?? "") as AssetId;

    let stored: Result<AssetOutcome, AssetStoreRefusal>;
    try {
      stored = await pool.assets.store(
        id,
        guarded(
          context.req.raw.body,
          limits.maxUploadBytes,
          claimed.kind === "sha-256" ? claimed.hex : undefined,
        ),
        { filename, mime },
      );
    } catch (cause) {
      if (cause instanceof RefusedUpload) return refuse(cause.refusal);
      throw cause;
    }

    if (stored.kind === "refused") {
      return json(errorBody(stored.refusal), assetStoreStatus(stored.refusal));
    }

    const { asset } = stored.value;

    // No `Location` on a replay: the caller minted the id and knows where it is.
    return stored.value.kind === "stored"
      ? json(asset, 201, {
          location: `/v1/assets/${encodeURIComponent(asset.id)}`,
        })
      : json(asset, 200);
  };
}

export function assetHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = (context.req.param("id") ?? "") as AssetId;
    const asset = await pool.assets.get(id);

    return asset === undefined
      ? json(errorBody({ kind: "no-such-asset", asset: id }), 404)
      : json(asset, 200);
  };
}

export function assetContentHandler(pool: Pool) {
  return async (context: Context): Promise<Response> => {
    const id = (context.req.param("id") ?? "") as AssetId;
    const asset = await pool.assets.get(id);
    if (asset === undefined) {
      return json(errorBody({ kind: "no-such-asset", asset: id }), 404);
    }

    const opened = await pool.assets.open(asset.id, context.req.raw.signal);
    if (opened.kind === "refused") {
      return json(errorBody(opened.refusal), assetStatus(opened.refusal));
    }

    // No `Content-Length`: it would come from the row, and a read never rehashes,
    // so a blob that drifted in size would advertise a length its bytes disagree
    // with — a truncated transfer, where a chunked one fails honestly.
    return new Response(webStream(opened.value), {
      status: 200,
      headers: {
        "content-type": asset.mime,
        "content-disposition": contentDisposition(
          dispositionFor(asset.mime),
          asset.filename,
        ),
        // An asset id names one blob forever, so a cached copy cannot go stale.
        etag: `"${asset.blob}"`,
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  };
}

function webStream(
  bytes: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const chunks = bytes[Symbol.asyncIterator]();

  return new ReadableStream({
    pull: async (controller) => {
      const { done, value } = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: async (reason) => {
      await chunks.return?.(reason);
    },
  });
}
