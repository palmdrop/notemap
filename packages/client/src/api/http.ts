import createOpenapiClient from "openapi-fetch";

import { readRefusal, Refused, Unauthenticated, Unreachable } from "../errors";
import type { Transport } from "#ports/transport";
import type { paths } from "./generated";

export type Api = ReturnType<typeof createOpenapiClient<paths>>;

const WRITES = new Set(["POST", "PUT", "PATCH"]);
const JSON_MEDIA_TYPE = "application/json";

/**
 * Every `/v1` write declares its media type, carrying a body or not — which is
 * what keeps a cross-site page from making one without the browser asking the
 * daemon first. `openapi-fetch` sets the header only where there is a body to
 * serialise, so the routes taking none would otherwise arrive without it.
 */
function declaring(request: Request): Request {
  if (!WRITES.has(request.method) || request.headers.has("content-type")) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.set("content-type", JSON_MEDIA_TYPE);

  return new Request(request, { headers });
}

/**
 * A pool that accepts a connection and never answers holds the request open
 * with nothing to wait for, so the signal a closing client carries is what
 * lets a process end rather than wait on it.
 */
function cancellable(
  request: Request,
  signal: AbortSignal | undefined,
): Request {
  return signal === undefined ? request : new Request(request, { signal });
}

export function createApi(transport: Transport, signal?: AbortSignal): Api {
  return createOpenapiClient<paths>({
    baseUrl: transport.baseUrl,
    fetch: (request) =>
      transport.fetch(cancellable(declaring(request), signal)),
  });
}

type Answer<T> = { data?: T; error?: unknown; response?: Response };

/**
 * Neither a 5xx nor a 401 is a refusal. In both the pool did not weigh the
 * request and say no — one failed to answer it, the other would not look at it
 * — so the operation keeps its optimistic state and goes again, the same
 * reading as a socket that never opened.
 *
 * They are told apart because a surface must: a daemon having trouble is
 * waited out, and a session that lapsed is waited on by a person signing in.
 */
function undecided(answer: Answer<unknown>): void {
  const status = answer.response?.status;
  if (status === undefined) return;

  if (status === 401) throw new Unauthenticated();

  if (status >= 500) {
    throw new Unreachable(
      new Error(`the daemon answered ${String(status)}`),
      "the daemon is having trouble; this will be tried again",
    );
  }
}

/**
 * Separates the two failures that must not be confused: a pool that said no,
 * which retrying will not change, and a pool that did not answer, which is the
 * only reason an operation stays in the outbox.
 */
export async function answered<T>(call: Promise<Answer<T>>): Promise<T> {
  let answer: Answer<T>;
  try {
    answer = await call;
  } catch (cause) {
    throw new Unreachable(cause);
  }

  undecided(answer);
  if (answer.error !== undefined) throw readRefusal(answer.error);
  if (answer.data === undefined) {
    throw new Refused("empty-answer", "the daemon answered with nothing");
  }

  return answer.data;
}

export async function acknowledged(
  call: Promise<Answer<unknown>>,
): Promise<void> {
  let answer: Answer<unknown>;
  try {
    answer = await call;
  } catch (cause) {
    throw new Unreachable(cause);
  }

  undecided(answer);
  if (answer.error !== undefined) throw readRefusal(answer.error);
}
