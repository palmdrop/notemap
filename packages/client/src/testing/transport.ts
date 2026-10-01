import type { Transport } from "#ports/transport";

export type Handler = (request: Request) => Promise<Response> | Response;

export type MockTransport = Transport & {
  /** Every request that reached it, oldest first, the health probe included. */
  readonly sent: readonly Request[];
  unreachable(failing: boolean): void;
  /** Which pool it says it is; set it to rebuild one. */
  pool: string;
  /**
   * What `/v1/health` answers. Null hands the route to the test's own handler,
   * which is the only way to exercise a probe that is refused or does not decide.
   */
  health: (() => Response) | null;
  /**
   * What `/v1/counts` answers. The client reads it on its own after work
   * drains, so it is answered here as health is; null hands it to the handler.
   */
  counts: (() => Response) | null;
};

export const POOL = "http://pool.test";
export const HEALTH = "GET /v1/health";
export const COUNTS = "GET /v1/counts";
const IDENTITY = "a1c9f2e4-6b30-4d51-9e7a-2f8b40c1d6e3";
export const VERSION = "0.0.0-test";

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

  const transport: MockTransport = {
    baseUrl: POOL,
    sent,
    pool: IDENTITY,
    health: () => json(200, { pool: transport.pool, version: VERSION }),
    counts: () => json(200, { queue: 0 }),

    assetUrl: (asset) =>
      `${POOL}/v1/assets/${encodeURIComponent(asset)}/content`,

    unreachable(next) {
      failing = next;
    },

    async fetch(request) {
      // A real fetch refuses an aborted signal before it reaches the network,
      // and a mock that answered anyway would let a closed client look alive.
      if (request.signal.aborted) throw request.signal.reason as Error;

      sent.push(request.clone());
      if (failing) throw new TypeError("fetch failed");

      // Answered here rather than by a test's handler: every client asks it on
      // start. `health` is how a test takes the route back.
      const asked = `${request.method} ${new URL(request.url).pathname}`;
      const health = transport.health;
      if (asked === HEALTH && health !== null) return health();
      const counts = transport.counts;
      if (asked === COUNTS && counts !== null) return counts();
      return handler(request);
    },
  };

  return transport;
}
