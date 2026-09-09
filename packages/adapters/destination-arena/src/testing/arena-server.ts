import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * An are.na standing in for the real one, in this process and in memory.
 *
 * It is a **fake**, and the parts of v3 it implements are the parts this
 * adapter uses: `GET /v3/me`, one page of a user's channels, presigning an
 * upload, taking the bytes, and creating a block. Whether the real thing agrees
 * — that a presigned PUT accepts a streamed body, what `POST /v3/blocks`
 * really answers, where the block type inference draws its lines — is what
 * hand verification against a real account is for; nothing here can answer it.
 */
export type ArenaServer = {
  /** What the adapter is pointed at, in place of `https://api.are.na`. */
  readonly url: string;
  /** Where a presigned upload lands, in place of the S3 bucket. */
  readonly uploadsUrl: string;
  readonly token: string;
  /** The blocks that were created, in order, as the request bodies said. */
  blocks(): readonly Record<string, unknown>[];
  /** Every object that was uploaded, key to bytes. */
  uploads(): Record<string, string>;
  /** What arrived, in order, as `METHOD /path`. */
  requests(): readonly string[];
  /** The channels the account holds, replacing whatever it held. */
  holds(channels: readonly ChannelRow[], more?: boolean): void;
  /** Answer the next request to that path with this status, once. */
  answerOnce(path: string, status: number, body?: unknown): void;
  /** Whether the bytes at that key arrived chunked rather than under a `Content-Length`. */
  arrivedChunked(key: string): boolean;
  close(): Promise<void>;
};

/** A channel as the contents endpoint answers one, down to what is read. */
export type ChannelRow = {
  readonly slug: string;
  readonly title: string;
  /** The name that survives a retitle. Numbered from the position where none is given. */
  readonly id?: number;
  /** Absent is a channel with no `can` at all, which is kept rather than dropped. */
  readonly addTo?: boolean;
};

const USER = 42;

export async function startArenaServer(): Promise<ArenaServer> {
  const token = "an-are-na-token";
  const expected = `Bearer ${token}`;

  let channels: readonly ChannelRow[] = [];
  let more = false;

  const created: Record<string, unknown>[] = [];
  const uploaded = new Map<string, string>();
  const seen: string[] = [];
  const chunked = new Set<string>();
  const answers = new Map<string, { status: number; body: unknown }>();

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname;
    seen.push(`${request.method} ${path}`);

    const answered = answers.get(path);
    if (answered !== undefined) {
      answers.delete(path);
      return send(response, answered.status, answered.body ?? {});
    }

    // The uploads bucket is its own authorisation, so no token is expected on it.
    if (path.startsWith("/uploads/")) {
      if (request.method !== "PUT") return send(response, 405, {});
      const key = path.slice("/uploads/".length);
      if (request.headers["content-length"] === undefined) chunked.add(key);

      return read(request, (body) => {
        uploaded.set(key, body);
        send(response, 200, {});
      });
    }

    if (request.headers["authorization"] !== expected) {
      return send(response, 401, { error: { message: "unauthorized" } });
    }

    if (request.method === "GET" && path === "/v3/me") {
      return send(response, 200, { id: USER, slug: "alice" });
    }

    if (request.method === "GET" && path === `/v3/users/${USER}/contents`) {
      return send(response, 200, {
        data: channels.map((channel, index) => ({
          id: channel.id ?? index + 1,
          type: "Channel",
          slug: channel.slug,
          title: channel.title,
          ...(channel.addTo === undefined
            ? {}
            : { can: { add_to: channel.addTo } }),
        })),
        meta: { has_more_pages: more },
      });
    }

    // One channel by either name it answers to, which is how a value already
    // in a field is read back: the ID a template holds, or the slug.
    if (request.method === "GET" && path.startsWith("/v3/channels/")) {
      const handle = decodeURIComponent(path.slice("/v3/channels/".length));
      const found = channels.find(
        (channel, index) =>
          channel.slug === handle || String(channel.id ?? index + 1) === handle,
      );
      if (found === undefined) {
        return send(response, 404, { error: { message: "no such channel" } });
      }

      return send(response, 200, {
        id: found.id ?? channels.indexOf(found) + 1,
        type: "Channel",
        slug: found.slug,
        title: found.title,
        ...(found.addTo === undefined ? {} : { can: { add_to: found.addTo } }),
      });
    }

    if (request.method === "POST" && path === "/v3/uploads/presign") {
      return read(request, (body) => {
        const files = (
          JSON.parse(body) as {
            files: { filename: string; content_type: string }[];
          }
        ).files;
        const first = files[0] as { filename: string; content_type: string };
        const key = `uploads/${created.length}-${first.filename}`;

        send(response, 201, {
          files: [
            {
              upload_url: `${uploadsAt(server)}/${key}`,
              key,
              content_type: first.content_type,
            },
          ],
          expires_in: 3600,
        });
      });
    }

    if (request.method === "POST" && path === "/v3/blocks") {
      return read(request, (body) => {
        const block = JSON.parse(body) as Record<string, unknown>;
        created.push(block);
        send(response, 201, { id: 1000 + created.length, type: "Text" });
      });
    }

    send(response, 404, { error: { message: "no such route" } });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = addressOf(server);

  return {
    url,
    uploadsUrl: `${url}/uploads`,
    token,
    blocks: () => [...created],
    uploads: () => Object.fromEntries(uploaded),
    requests: () => [...seen],
    holds: (held, hasMore = false) => {
      channels = held;
      more = hasMore;
    },
    answerOnce: (path, status, body) => answers.set(path, { status, body }),
    arrivedChunked: (key) => chunked.has(key),
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function addressOf(server: Server): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function uploadsAt(server: Server): string {
  return `${addressOf(server)}/uploads`;
}

function read(request: IncomingMessage, then: (body: string) => void): void {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => then(Buffer.concat(chunks).toString("utf8")));
}

function send(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  const written = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(written)),
  });
  response.end(written);
}
