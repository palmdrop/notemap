import type { WebdavCredential } from "./credentials";
import { Refused, Unreachable } from "./errors";

/** What a `GET` found, or `undefined` where there was nothing there. */
export type Fetched =
  { readonly body: string; readonly etag: string | undefined } | undefined;

/** Whether a conditional write went through, or lost to whoever wrote first. */
export type Conditional = "written" | "condition-failed";

export type Dav = {
  get(path: string, signal?: AbortSignal): Promise<Fetched>;
  /** `PUT` that must not overwrite. */
  create(path: string, body: Body, signal?: AbortSignal): Promise<Conditional>;
  /** `PUT` that must land on exactly the note that was read. */
  replace(
    path: string,
    body: Body,
    etag: string,
    signal?: AbortSignal,
  ): Promise<Conditional>;
  /** Makes one collection. A collection that is already there is the outcome asked for. */
  makeCollection(path: string, signal?: AbortSignal): Promise<void>;
};

export type Body = string | AsyncIterable<Uint8Array>;

/** A conditional request that failed its condition, which every caller reads differently. */
const CONDITION_FAILED = 412;

/** What a collection that is already there answers `MKCOL`. */
const ALREADY_A_COLLECTION = 405;

const NOT_THERE = 404;

/** A `PUT` or `MKCOL` whose parent collection does not exist. */
const NO_PARENT = 409;

export function createDav(credential: WebdavCredential): Dav {
  const authorization = `Basic ${Buffer.from(
    `${credential.username}:${credential.password}`,
    "utf8",
  ).toString("base64")}`;

  const send = async (
    method: string,
    path: string,
    init: {
      body?: Body;
      headers?: Record<string, string>;
      signal?: AbortSignal | undefined;
    } = {},
  ): Promise<Response> => {
    const url = `${credential.baseUrl}/${path}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: { ...init.headers, authorization },
        ...(init.body === undefined
          ? {}
          : typeof init.body === "string"
            ? { body: init.body }
            : // A body that arrives chunk by chunk cannot be sent before the
              // server has answered its headers, which is what `half` says.
              { body: init.body, duplex: "half" }),
        // A credential is attached to this request and to nothing else. A
        // redirect followed automatically would carry it to whatever address
        // the answer named, which is the one thing a fixed base URL exists to
        // prevent.
        redirect: "manual",
        ...(init.signal === undefined ? {} : { signal: init.signal }),
      } as RequestInit);
    } catch (cause) {
      throw new Unreachable(`${method} ${url}: ${why(cause)}`, { cause });
    }

    if (response.status >= 300 && response.status < 400) {
      // The body is never read, so the socket is released rather than held.
      void response.body?.cancel();
      throw new Unreachable(
        `${url} answered ${response.status} to ${method}, and a credential is never carried to ${response.headers.get("location") ?? "wherever that points"}`,
      );
    }

    return response;
  };

  const ok = async (response: Response, path: string): Promise<void> => {
    if (response.ok) return;
    void response.body?.cancel();
    throw failure(response, path);
  };

  return {
    get: async (path, signal) => {
      const response = await send("GET", path, { signal });
      if (response.status === NOT_THERE) {
        void response.body?.cancel();
        return undefined;
      }
      await ok(response, path);

      return {
        body: await response.text(),
        etag: response.headers.get("etag") ?? undefined,
      };
    },

    create: async (path, body, signal) => {
      const response = await send("PUT", path, {
        body,
        headers: { "if-none-match": "*" },
        signal,
      });
      if (response.status === CONDITION_FAILED) {
        void response.body?.cancel();
        return "condition-failed";
      }
      await ok(response, path);
      void response.body?.cancel();
      return "written";
    },

    replace: async (path, body, etag, signal) => {
      const response = await send("PUT", path, {
        body,
        headers: { "if-match": etag },
        signal,
      });
      if (response.status === CONDITION_FAILED) {
        void response.body?.cancel();
        return "condition-failed";
      }
      await ok(response, path);
      void response.body?.cancel();
      return "written";
    },

    makeCollection: async (path, signal) => {
      const response = await send("MKCOL", path, { signal });
      if (response.status === ALREADY_A_COLLECTION) {
        void response.body?.cancel();
        return;
      }
      await ok(response, path);
      void response.body?.cancel();
    },
  };
}

/**
 * What a status that is not a success means for the delivery. The line is
 * evidence, not severity: anything that a later attempt could find different is
 * unreachable, and only what the server will say again is a refusal.
 *
 * A rejected credential is on the retrying side, on the same terms as the
 * filesystem kind's permission errors: wrongly retrying is bounded and ends up
 * in front of a person anyway, while wrongly abandoning throws away a decision
 * somebody made — and a password that has just been rotated is the ordinary
 * case.
 */
function failure(response: Response, path: string): Error {
  const at = `${path} answered ${response.status}`;

  if (response.status === NO_PARENT) {
    return new Unreachable(`${at}, so something above it is not there`);
  }
  if (
    response.status >= 500 ||
    response.status === 429 ||
    response.status === 408
  ) {
    return new Unreachable(at);
  }
  if (response.status === 401 || response.status === 403) {
    return new Unreachable(`${at}: the account would not have it`);
  }

  return new Refused(at);
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
