import type { Transport } from "../ports/transport";

export type Handler = (request: Request) => Promise<Response> | Response;

export type MockTransport = Transport & {
  /** Every request that reached it, oldest first. */
  readonly sent: readonly Request[];
  unreachable(failing: boolean): void;
};

export const POOL = "http://pool.test";

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function refusal(status: number, code: string): Response {
  return json(status, { error: { code } });
}

export function mockTransport(handler: Handler): MockTransport {
  const sent: Request[] = [];
  let failing = false;

  return {
    baseUrl: POOL,
    sent,

    unreachable(next) {
      failing = next;
    },

    async fetch(request) {
      sent.push(request.clone());
      if (failing) throw new TypeError("fetch failed");
      return handler(request);
    },
  };
}
