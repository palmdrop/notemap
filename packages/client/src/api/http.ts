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

type Answer<T> = { data?: T; error?: unknown };

/**
 * Separates the two failures that must not be confused: a pool that said no,
 * which retrying will not change, and a pool that was not there, which is the
 * only reason an operation stays in the outbox.
 */
export async function answered<T>(call: Promise<Answer<T>>): Promise<T> {
  let answer: Answer<T>;
  try {
    answer = await call;
  } catch (cause) {
    throw new Unreachable(cause);
  }

  if (answer.error !== undefined) throw readRefusal(answer.error);
  if (answer.data === undefined) {
    throw new Refused("empty-answer", "the daemon answered with nothing");
  }

  return answer.data;
}

/** For a route that answers no content: nothing to read, only a refusal to catch. */
export async function acknowledged(
  call: Promise<{ error?: unknown }>,
): Promise<void> {
  let answer: { error?: unknown };
  try {
    answer = await call;
  } catch (cause) {
    throw new Unreachable(cause);
  }

  if (answer.error !== undefined) throw readRefusal(answer.error);
}
