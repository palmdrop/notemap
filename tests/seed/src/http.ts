import type { Asset } from "./types.ts";

export class HttpFailure extends Error {
  readonly status: number;

  constructor(status: number, method: string, path: string, body: string) {
    super(`${method} ${path}: ${status} ${body}`);
    this.name = "HttpFailure";
    this.status = status;
  }
}

export type Http = {
  /**
   * Opens a session the way a browser does, and sends its cookie with every
   * request after.
   */
  readonly signIn: (name: string, password: string) => Promise<void>;
  readonly get: <T>(path: string) => Promise<T>;
  /** The value, or `undefined` where the daemon answered 404. */
  readonly find: <T>(path: string) => Promise<T | undefined>;
  readonly post: <T>(path: string, body?: unknown) => Promise<T>;
  readonly upload: (
    id: string,
    filename: string,
    mime: string,
    bytes: Uint8Array<ArrayBuffer>,
  ) => Promise<Asset>;
};

export function httpAt(
  baseUrl: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Http {
  const at = (path: string) => `${baseUrl.replace(/\/$/, "")}${path}`;
  const cookies = new Map<string, string>();

  const send = (url: string, init: RequestInit = {}): Promise<Response> => {
    if (cookies.size === 0) return fetcher(url, init);

    const headers = new Headers(init.headers);
    headers.set(
      "cookie",
      [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    );
    return fetcher(url, { ...init, headers });
  };

  const answered = async <T>(
    method: string,
    path: string,
    response: Response,
  ): Promise<T> => {
    if (!response.ok) {
      throw new HttpFailure(
        response.status,
        method,
        path,
        await response.text(),
      );
    }
    return (await response.json()) as T;
  };

  return {
    signIn: async (name, password) => {
      const response = await fetcher(at("/v1/session"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      await answered<unknown>("POST", "/v1/session", response);

      for (const said of response.headers.getSetCookie()) {
        const [pair] = said.split(";");
        const equals = pair?.indexOf("=") ?? -1;
        if (pair === undefined || equals < 1) continue;
        cookies.set(
          pair.slice(0, equals).trim(),
          pair.slice(equals + 1).trim(),
        );
      }
      if (cookies.size === 0) {
        throw new Error("signing in answered no session cookie");
      }
    },

    get: async <T>(path: string): Promise<T> =>
      answered<T>("GET", path, await send(at(path))),

    find: async <T>(path: string): Promise<T | undefined> => {
      const response = await send(at(path));
      if (response.status === 404) {
        await response.body?.cancel();
        return undefined;
      }
      return answered<T>("GET", path, response);
    },

    post: async <T>(path: string, body?: unknown): Promise<T> =>
      answered<T>(
        "POST",
        path,
        await send(at(path), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body ?? {}),
        }),
      ),

    upload: async (id, filename, mime, bytes): Promise<Asset> =>
      answered<Asset>(
        "PUT",
        `/v1/assets/${id}`,
        await send(at(`/v1/assets/${id}`), {
          method: "PUT",
          headers: {
            "content-type": mime,
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          },
          body: bytes,
        }),
      ),
  };
}
