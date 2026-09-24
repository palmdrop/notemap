import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { MAX_UNFURL_BYTES, USER_AGENT } from "./limits";
import type { Fetched, PinnedFetch } from "./types";

/**
 * `fetch` would resolve the name again, and an answer that changed since the
 * guard asked would walk straight through it. The name stays in the URL, so it
 * is still what `Host` and TLS SNI carry.
 */
export const pinnedFetch: PinnedFetch = (url, address, signal) =>
  new Promise<Fetched>((resolve, reject) => {
    const pinned: LookupFunction = (_hostname, options, callback) => {
      if (options.all === true) {
        callback(null, [address]);
      } else {
        callback(null, address.address, address.family);
      }
    };

    const request = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: pinned,
        signal,
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "accept-encoding": "gzip, deflate, br",
          "user-agent": USER_AGENT,
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        const contentType = response.headers["content-type"];
        const answered = {
          status,
          ...(location === undefined ? {} : { location }),
          ...(contentType === undefined ? {} : { contentType }),
        };

        if (status < 200 || status >= 300) {
          response.destroy();
          resolve({ ...answered, body: "" });
          return;
        }

        readCapped(decoded(response), MAX_UNFURL_BYTES).then(
          (bytes) => {
            response.destroy();
            resolve({ ...answered, body: decode(bytes, contentType) });
          },
          (error: unknown) => {
            response.destroy();
            reject(error);
          },
        );
      },
    );
    request.on("error", reject);
    request.end();
  });

function decoded(response: http.IncomingMessage): Readable {
  switch (response.headers["content-encoding"]) {
    case "gzip":
    case "x-gzip":
      return response.pipe(createGunzip());
    case "deflate":
      return response.pipe(createInflate());
    case "br":
      return response.pipe(createBrotliDecompress());
    default:
      return response;
  }
}

/** Counted after decompression, so a small compressed body cannot unpack past the cap. */
async function readCapped(stream: Readable, cap: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    const room = cap - length;
    chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
    length += Math.min(chunk.length, room);
    if (length >= cap) {
      stream.destroy();
      break;
    }
  }
  return Buffer.concat(chunks);
}

function decode(bytes: Uint8Array, contentType: string | undefined): string {
  const charset = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType ?? "")?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
