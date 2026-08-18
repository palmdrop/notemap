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
  readonly get: <T>(path: string) => Promise<T>;
  /** The value, or `undefined` where the daemon answered 404. */
  readonly find: <T>(path: string) => Promise<T | undefined>;
  readonly post: <T>(path: string, body?: unknown) => Promise<T>;
  readonly upload: (
    filename: string,
    mime: string,
    bytes: Uint8Array,
  ) => Promise<Asset>;
};

export function httpAt(
  baseUrl: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Http {
  const at = (path: string) => `${baseUrl.replace(/\/$/, "")}${path}`;

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
    get: async <T>(path: string): Promise<T> =>
      answered<T>("GET", path, await fetcher(at(path))),

    find: async <T>(path: string): Promise<T | undefined> => {
      const response = await fetcher(at(path));
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
        await fetcher(at(path), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body ?? {}),
        }),
      ),

    upload: async (filename, mime, bytes): Promise<Asset> =>
      answered<Asset>(
        "POST",
        "/v1/assets",
        await fetcher(at("/v1/assets"), {
          method: "POST",
          headers: {
            "content-type": mime,
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          },
          body: bytes,
        }),
      ),
  };
}
