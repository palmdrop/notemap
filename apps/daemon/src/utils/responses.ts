import { JSON_TYPE } from "../constants";
import { daemonStatus, errorBody } from "../errors/refusals";
import type { DaemonRefusal } from "../types";

export function json(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": JSON_TYPE, ...headers },
  });
}

export function refuse(
  refusal: DaemonRefusal,
  headers: Record<string, string> = {},
): Response {
  return json(errorBody(refusal), daemonStatus(refusal), headers);
}
