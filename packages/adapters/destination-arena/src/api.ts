import type { ArenaCredential } from "./credentials";
import { Refused, TokenRefused, Unreachable } from "./errors";

/** The service, not a deployment: nothing in config or in a setting can move it. */
export const ARENA_API = "https://api.are.na";

/** Where an uploaded object ends up, as `/v3/uploads/presign` documents the flow. */
export const ARENA_UPLOADS = "https://s3.amazonaws.com/arena_images-temp";

/** A block as this adapter asks for one. `value` is a URL or the text itself. */
export type BlockInput = {
  readonly value: string;
  readonly description?: string;
  readonly alt_text?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
};

/** What `POST /v3/blocks` answered, read down to the one field a record keeps. */
export type CreatedBlock = {
  readonly id: number;
};

/** One channel the token may write to, as `candidates` will offer it. */
export type Channel = {
  readonly slug: string;
  readonly title: string;
  /**
   * The one name that survives a retitle. Read here because the listing already
   * carries it — a browse that answered only slugs would make a template's
   * rot-proof form something a person has to go and look up by hand.
   */
  readonly id: number;
};

export type ChannelPage = {
  readonly channels: readonly Channel[];
  readonly more: boolean;
};

export type PresignedFile = {
  readonly uploadUrl: string;
  readonly key: string;
  readonly contentType: string;
};

export type Arena = {
  /** Who the token is. The response does not carry its scope, so this cannot catch a read-only one. */
  me(signal?: AbortSignal): Promise<{ readonly id: number }>;
  /**
   * One page of the channels a user made, most recently updated first. Takes
   * the id `me` answered: there is no `/v3/me/contents`, so a browse is two
   * requests rather than one.
   */
  channels(user: number, signal?: AbortSignal): Promise<ChannelPage>;
  presign(
    filename: string,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<PresignedFile>;
  /** The bytes, streamed to the address are.na named. No notemap credential is attached. */
  upload(
    to: PresignedFile,
    bytes: AsyncIterable<Uint8Array>,
    length: number,
    signal?: AbortSignal,
  ): Promise<void>;
  createBlock(
    channel: string,
    block: BlockInput,
    signal?: AbortSignal,
  ): Promise<CreatedBlock>;
  /** Where the bytes are once uploaded, as the presign flow documents the address. */
  uploadedUrl(key: string): string;
};

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const TIMED_OUT = 408;
const UNPROCESSABLE = 422;
const RATE_LIMITED = 429;
const SERVER_FAULT = 500;

/** One page, and the only page: browsing is not enumerating what an account holds. */
const PER_PAGE = 100;

export type ArenaConfig = {
  readonly credential: ArenaCredential;
  /** Host-wired, so the suite can point at a fake. Never a setting and never config. */
  readonly baseUrl?: string;
  readonly uploadsUrl?: string;
};

export function createArena(config: ArenaConfig): Arena {
  const baseUrl = (config.baseUrl ?? ARENA_API).replace(/\/+$/, "");
  const uploadsUrl = (config.uploadsUrl ?? ARENA_UPLOADS).replace(/\/+$/, "");

  const send = async (
    method: string,
    path: string,
    init: {
      body?: string;
      headers?: Record<string, string>;
      signal?: AbortSignal | undefined;
    } = {},
  ): Promise<Response> => {
    const url = `${baseUrl}${path}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          ...init.headers,
          authorization: `Bearer ${config.credential.token}`,
          accept: "application/json",
        },
        ...(init.body === undefined ? {} : { body: init.body }),
        // The token is attached to this request and to nothing else. A redirect
        // followed automatically would carry it to whatever address the answer
        // named.
        redirect: "manual",
        ...(init.signal === undefined ? {} : { signal: init.signal }),
      });
    } catch (cause) {
      throw new Unreachable(`${method} ${url}: ${why(cause)}`, { cause });
    }

    if (response.status >= 300 && response.status < 400) {
      void response.body?.cancel();
      throw new Unreachable(
        `${url} answered ${response.status} to ${method}, and a token is never carried to ${response.headers.get("location") ?? "wherever that points"}`,
      );
    }

    if (!response.ok) {
      const detail = await said(response);
      throw failure(response.status, `${method} ${path}`, detail);
    }

    return response;
  };

  const json = async (response: Response): Promise<unknown> => {
    try {
      return await response.json();
    } catch (cause) {
      throw new Unreachable(`are.na answered something that is not JSON`, {
        cause,
      });
    }
  };

  return {
    me: async (signal) => {
      const body = await json(await send("GET", "/v3/me", { signal }));
      const id = at(body, "id");
      if (typeof id !== "number") {
        throw new Unreachable("are.na answered no id for this token");
      }
      return { id };
    },

    channels: async (user, signal) => {
      const body = await json(
        await send(
          "GET",
          `/v3/users/${user}/contents?type=Channel&sort=updated_at_desc&per=${PER_PAGE}`,
          { signal },
        ),
      );

      return {
        channels: channelsIn(body),
        more: at(at(body, "meta"), "has_more_pages") === true,
      };
    },

    presign: async (filename, contentType, signal) => {
      const body = await json(
        await send("POST", "/v3/uploads/presign", {
          body: JSON.stringify({
            files: [{ filename, content_type: contentType }],
          }),
          headers: { "content-type": "application/json" },
          signal,
        }),
      );

      const first = firstOf(at(body, "files"));
      const uploadUrl = at(first, "upload_url");
      const key = at(first, "key");
      const type = at(first, "content_type");

      if (
        typeof uploadUrl !== "string" ||
        typeof key !== "string" ||
        typeof type !== "string"
      ) {
        throw new Unreachable("are.na presigned no upload for the asset");
      }

      return { uploadUrl, key, contentType: type };
    },

    upload: async (to, bytes, length, signal) => {
      let response: Response;
      try {
        response = await fetch(to.uploadUrl, {
          method: "PUT",
          headers: {
            "content-type": to.contentType,
            // S3 will not accept a chunked body on a presigned PUT, and the
            // asset registry knows the length without reading the bytes.
            "content-length": String(length),
          },
          body: bytes,
          duplex: "half",
          redirect: "manual",
          ...(signal === undefined ? {} : { signal }),
        } as RequestInit);
      } catch (cause) {
        throw new Unreachable(
          `the asset could not be uploaded: ${why(cause)}`,
          {
            cause,
          },
        );
      }

      if (!response.ok) {
        void response.body?.cancel();
        // Never `rejected`: the URL is minted per attempt and expires in an
        // hour, so a refusal here is one the next attempt may not meet.
        throw new Unreachable(
          `the upload of the asset answered ${response.status}`,
        );
      }
      void response.body?.cancel();
    },

    createBlock: async (channel, block, signal) => {
      const body = await json(
        await send("POST", "/v3/blocks", {
          body: JSON.stringify({ ...block, channel_ids: [channel] }),
          headers: { "content-type": "application/json" },
          signal,
        }),
      );

      const id = at(body, "id");
      if (typeof id !== "number") {
        // The block may well have landed, so this is not a refusal.
        throw new Unreachable("are.na answered no block id");
      }
      return { id };
    },

    uploadedUrl: (key) => `${uploadsUrl}/${key}`,
  };
}

/**
 * A token that is under-scoped, a channel that is gone and a block are.na would
 * not take are all permanent: retrying cannot change any of them, unlike a
 * rotated password. `401` is the exception a delivery reads differently, so it
 * is thrown as itself and mapped by the caller.
 */
function failure(status: number, what: string, detail: string): Error {
  if (status === UNAUTHORIZED) {
    return new TokenRefused(`are.na refused the token${detail}`);
  }
  if (status === FORBIDDEN) {
    return new Refused(
      `are.na refused ${what} with 403 — most often a token minted with read scope rather than write${detail}`,
    );
  }
  if (status === NOT_FOUND) {
    return new Refused(
      `are.na answered 404 to ${what} — most often a channel that was renamed, which changes its slug; browse and pick it again${detail}`,
    );
  }
  if (status === UNPROCESSABLE) {
    return new Refused(`are.na would not take it${detail}`);
  }
  if (
    status === TIMED_OUT ||
    status === RATE_LIMITED ||
    status >= SERVER_FAULT
  ) {
    return new Unreachable(`are.na answered ${status} to ${what}${detail}`);
  }
  return new Refused(`are.na answered ${status} to ${what}${detail}`);
}

/** are.na's own words where it gave any, so a refusal says more than a number. */
async function said(response: Response): Promise<string> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return "";
  }

  const message = at(at(body, "error"), "message") ?? at(body, "message");
  return typeof message === "string" && message !== "" ? `: ${message}` : "";
}

function at(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

/**
 * The channels the token can post into. `can` is documented as present only on
 * a full resource and is nullable besides, so a channel that does not carry it
 * is kept: a missing ability is not a denial.
 */
function channelsIn(body: unknown): readonly Channel[] {
  const data = at(body, "data");
  if (!Array.isArray(data)) return [];

  return data.flatMap((each) => {
    const slug = at(each, "slug");
    const title = at(each, "title");
    if (typeof slug !== "string" || slug === "") return [];

    const can = at(each, "can");
    if (can !== null && can !== undefined && at(can, "add_to") === false) {
      return [];
    }

    const id = at(each, "id");
    if (typeof id !== "number") return [];

    return [{ slug, title: typeof title === "string" ? title : slug, id }];
  });
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
