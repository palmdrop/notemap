import { createHash } from "node:crypto";

import type { Context } from "hono";

import type { AssetId, Pool } from "@notemap/core";

import {
  contentDisposition,
  filenameFrom,
} from "../assets/content-disposition";
import { dispositionFor } from "../assets/disposition";
import { assetStatus, errorBody } from "../errors/refusals";
import { json, refuse } from "../utils/responses";
import type { DaemonRefusal } from "../types";

export type UploadLimits = {
  readonly maxUploadBytes: number;
};

/** Thrown out of the body stream, so an upload that is refused mid-flight stores nothing. */
class RefusedUpload extends Error {
  readonly refusal: DaemonRefusal;

  constructor(refusal: DaemonRefusal) {
    super(refusal.kind);
    this.name = "RefusedUpload";
    this.refusal = refusal;
  }
}

export function assetUploadHandler(pool: Pool, limits: UploadLimits) {
  return async (context: Context): Promise<Response> => {
    const mime = context.req.header("content-type")?.trim() ?? "";
    if (mime === "") {
      return refuse({ kind: "unsupported-media-type", contentType: mime });
    }

    const filename = filenameFrom(context.req.header("content-disposition"));
    if (filename === undefined) return refuse({ kind: "missing-filename" });

    const claimed = sha256From(context.req.header("repr-digest"));

    let result;
    try {
      result = await pool.assets.store(
        guarded(context.req.raw.body, limits.maxUploadBytes, claimed),
        { filename, mime },
      );
    } catch (cause) {
      if (cause instanceof RefusedUpload) return refuse(cause.refusal);
      throw cause;
    }

    if (result.kind === "refused") {
      return json(errorBody(result.refusal), assetStatus(result.refusal));
    }

    return json(result.value, 201, {
      location: `/v1/assets/${encodeURIComponent(result.value.id)}`,
    });
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

    return new Response(webStream(opened.value), {
      status: 200,
      headers: {
        "content-type": asset.mime,
        "content-length": String(asset.bytes),
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

/**
 * The size limit is checked against the bytes as they arrive rather than
 * against `Content-Length`, which is a claim, and the digest at the end, before
 * the blob store renames anything into place — so a refused upload leaves no
 * blob and no asset.
 */
async function* guarded(
  body: ReadableStream<Uint8Array> | null,
  max: number,
  claimed: string | undefined,
): AsyncGenerator<Uint8Array> {
  const digest = createHash("sha256");
  let size = 0;

  if (body !== null) {
    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        size += value.byteLength;
        if (size > max) {
          throw new RefusedUpload({ kind: "asset-too-large", max });
        }

        digest.update(value);
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }

  const actual = digest.digest("hex");
  if (claimed !== undefined && claimed !== actual) {
    throw new RefusedUpload({
      kind: "digest-mismatch",
      expected: claimed,
      actual,
    });
  }
}

/**
 * RFC 9530, as hex. An entry naming any other algorithm is ignored, which is
 * what the RFC asks of a recipient that supports none of the ones offered.
 */
function sha256From(header: string | undefined): string | undefined {
  const encoded = /(?:^|,)\s*sha-256\s*=\s*:([^:]*):/i.exec(header ?? "")?.[1];
  if (encoded === undefined) return undefined;

  const decoded = Buffer.from(encoded, "base64");
  return decoded.byteLength === 32 ? decoded.toString("hex") : undefined;
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
