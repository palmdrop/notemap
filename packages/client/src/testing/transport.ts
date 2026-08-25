import type { Transport } from "../ports/transport";

export type Handler = (request: Request) => Promise<Response> | Response;

export type MockTransport = Transport & {
  /** Every request that reached it, oldest first, the health probe included. */
  readonly sent: readonly Request[];
  unreachable(failing: boolean): void;
  /** Which pool it says it is. A test that rebuilds one answers a new identity. */
  pool: string;
};

export const POOL = "http://pool.test";
export const HEALTH = "GET /v1/health";
const IDENTITY = "a1c9f2e4-6b30-4d51-9e7a-2f8b40c1d6e3";

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function refusal(
  status: number,
  code: string,
  facts: Record<string, unknown> = {},
): Response {
  return json(status, { error: { code, ...facts } });
}

export function mockTransport(handler: Handler): MockTransport {
  const sent: Request[] = [];
  let failing = false;

  return {
    baseUrl: POOL,
    sent,
    pool: IDENTITY,

    assetUrl: (asset) =>
      `${POOL}/v1/assets/${encodeURIComponent(asset)}/content`,

    unreachable(next) {
      failing = next;
    },

    async fetch(request) {
      sent.push(request.clone());
      if (failing) throw new TypeError("fetch failed");

      // Answered here rather than by a test's handler: every client asks it on
      // start, and it is the mock pool's own answer rather than the test's.
      const asked = `${request.method} ${new URL(request.url).pathname}`;
      return asked === HEALTH ? json(200, { pool: this.pool }) : handler(request);
    },
  };
}
