import type { Bytes, PoolTarget } from "../types";

/** Enough of an `Item` to carry on with; the rest is the pool's business. */
export type Item = { readonly id: string };

export type CaptureAnswer =
  | { readonly kind: "captured"; readonly item: Item }
  | { readonly kind: "already-captured"; readonly item: Item }
  /** The identity is taken by an item saying something else: the upstream item changed. */
  | { readonly kind: "changed"; readonly existing: string };

export type EditAnswer =
  | { readonly kind: "amended"; readonly item: Item }
  | { readonly kind: "revised"; readonly revision: Item };

export type Asset = {
  readonly id: string;
  readonly filename: string;
  readonly mime: string;
  readonly bytes: number;
};

export type CaptureEnvelope = {
  readonly source: string;
  readonly sourceItemId: string;
  readonly capturedAt: string;
  readonly payload: unknown;
  readonly tags: readonly string[];
};

export type EditEnvelope = {
  readonly source: string;
  readonly sourceItemId: string;
  readonly payload: unknown;
};

/** What the pool said no to, with the code it said it under. */
export class PoolRefused extends Error {
  readonly status: number;
  readonly code: string;
  readonly route: string;

  constructor(status: number, code: string, route: string) {
    super(`${route} was refused ${String(status)} ${code}`);
    this.name = "PoolRefused";
    this.status = status;
    this.code = code;
    this.route = route;
  }
}

/**
 * The pool never answered at all. Its own class rather than a status of zero,
 * because a caller scanning an upstream has to tell the far end being gone from
 * this one item being wrong — the first is every item's failure and the second
 * is one item's.
 */
export class PoolUnreachable extends Error {
  readonly route: string;

  constructor(route: string, cause: unknown) {
    super(`${route} could not be reached`, { cause });
    this.name = "PoolUnreachable";
    this.route = route;
  }
}

/**
 * Whether what failed was the pool rather than the item that happened to be in
 * hand: it was never reached, it refused the token, or it broke. A scan that
 * carries on past one of these writes the same line once per item and lands
 * nothing, so a caller reads this and stops.
 */
export function notThisItem(cause: unknown): boolean {
  if (cause instanceof PoolUnreachable) return true;

  return (
    cause instanceof PoolRefused &&
    (cause.status === 401 || cause.status === 403 || cause.status >= 500)
  );
}

type ErrorBody = { readonly error?: { readonly code?: string } };

/**
 * `/v1` over plain `fetch`, and nothing else. A relay is not a
 * `@notemap/client`: a client holds an outbox and a cache, and the material a
 * relay carries is already durable in the system it read it from.
 */
export type Pool = ReturnType<typeof poolAt>;

export function poolAt(target: PoolTarget) {
  const send = target.fetch ?? globalThis.fetch;
  const base = target.url.replace(/\/+$/, "");

  async function request(
    route: string,
    init: RequestInit,
    accepted: readonly number[],
  ): Promise<Response> {
    let response: Response;
    try {
      response = await send(`${base}${route}`, {
        ...init,
        headers: {
          ...init.headers,
          authorization: `Bearer ${target.token}`,
        },
      });
    } catch (cause) {
      // An abort is the caller stopping, and stays itself.
      if ((cause as Error | undefined)?.name === "AbortError") throw cause;
      throw new PoolUnreachable(route, cause);
    }

    if (!accepted.includes(response.status)) {
      throw new PoolRefused(response.status, await codeOf(response), route);
    }
    return response;
  }

  async function codeOf(response: Response): Promise<string> {
    try {
      return (
        ((await response.json()) as ErrorBody).error?.code ?? "unreadable-error"
      );
    } catch {
      return "unreadable-error";
    }
  }

  return {
    /** Absent means the pool has never taken bytes under this id. */
    async asset(id: string, signal?: AbortSignal): Promise<Asset | undefined> {
      const route = `/v1/assets/${encodeURIComponent(id)}`;
      const response = await request(
        route,
        { method: "GET", ...(signal === undefined ? {} : { signal }) },
        [200, 404],
      );

      return response.status === 404
        ? undefined
        : ((await response.json()) as Asset);
    },

    /**
     * Idempotent on all four of the id, the bytes, the filename and the media
     * type: the same upload twice is `200`, and anything else under a used id
     * is `409 asset-id-conflict`, which is a caller's mistake and thrown.
     */
    async upload(
      id: string,
      attachment: { filename: string; mime: string; body: Bytes },
      signal?: AbortSignal,
    ): Promise<Asset> {
      const route = `/v1/assets/${encodeURIComponent(id)}`;
      const response = await request(
        route,
        {
          method: "PUT",
          headers: {
            "content-type": attachment.mime || "application/octet-stream",
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
          },
          body: attachment.body,
          // Node refuses a streamed body without it, and `RequestInit` has no
          // field for it — which is what the cast below is for.
          duplex: "half",
          ...(signal === undefined ? {} : { signal }),
        } as RequestInit,
        [200, 201],
      );

      return (await response.json()) as Asset;
    },

    async capture(
      envelope: CaptureEnvelope,
      signal?: AbortSignal,
    ): Promise<CaptureAnswer> {
      const route = "/v1/captures";
      const response = await request(
        route,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(envelope),
          ...(signal === undefined ? {} : { signal }),
        },
        [200, 201, 409],
      );

      const body = (await response.json()) as
        | { kind: "captured" | "already-captured"; item: Item }
        | { error: { code: string; existing?: string } };

      if ("error" in body) {
        if (body.error.code !== "source-item-changed" || !body.error.existing) {
          throw new PoolRefused(409, body.error.code, route);
        }
        return { kind: "changed", existing: body.error.existing };
      }

      return body;
    },

    async edit(
      item: string,
      envelope: EditEnvelope,
      signal?: AbortSignal,
    ): Promise<EditAnswer> {
      const route = `/v1/items/${encodeURIComponent(item)}/edit`;
      const response = await request(
        route,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(envelope),
          ...(signal === undefined ? {} : { signal }),
        },
        [200],
      );

      return (await response.json()) as EditAnswer;
    },
  };
}
