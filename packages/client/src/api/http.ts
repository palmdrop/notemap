import createOpenapiClient from "openapi-fetch";

import { readRefusal, Refused, Unreachable } from "../errors";
import type { Transport } from "../ports/transport";
import type { paths } from "./generated";

export type Api = ReturnType<typeof createOpenapiClient<paths>>;

export function createApi(transport: Transport): Api {
  return createOpenapiClient<paths>({
    baseUrl: transport.baseUrl,
    fetch: (request) => transport.fetch(request),
  });
}

type Answer<T> = { data?: T; error?: unknown; response?: Response };

/**
 * A 5xx is not a refusal. The pool did not weigh the request and say no, it
 * failed to answer it, so the operation keeps its optimistic state and goes
 * again — the same reading as a socket that never opened.
 */
function undecided(answer: Answer<unknown>): void {
  const status = answer.response?.status;
  if (status !== undefined && status >= 500) {
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
