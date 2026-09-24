import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { pipeline, type Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { USER_AGENT } from "./limits";
import type { Fetched, PinnedFetch } from "./types";

export type PinnedFetchOptions = {
  /** Trusted besides the system's roots. Only a test has a reason to. */
  readonly ca?: string;
};

/**
 * `fetch` would resolve the name again, and an answer that changed since the
 * guard asked would walk straight through it. The name stays in the URL, so it
 * is still what `Host` and TLS SNI carry, and what the certificate is checked
 * against.
 */
export function createPinnedFetch(
  options: PinnedFetchOptions = {},
): PinnedFetch {
  return (url, address, signal) =>
    new Promise<Fetched>((resolve, reject) => {
      const pinned: LookupFunction = (_hostname, lookup, callback) => {
        if (lookup.all === true) {
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
          ...(options.ca === undefined ? {} : { ca: options.ca }),
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
            resolve(answered);
            return;
          }
          resolve({ ...answered, body: decoded(response) });
        },
      );
      request.on("error", reject);
      request.end();
    });
}

export const pinnedFetch: PinnedFetch = createPinnedFetch();

/** Through `pipeline`, so destroying what is read destroys the socket under it. */
function decoded(response: http.IncomingMessage): Readable {
  const settled = () => undefined;
  switch (response.headers["content-encoding"]) {
    case "gzip":
    case "x-gzip":
      return pipeline(response, createGunzip(), settled);
    case "deflate":
      return pipeline(response, createInflate(), settled);
    case "br":
      return pipeline(response, createBrotliDecompress(), settled);
    default:
      return response;
  }
}
