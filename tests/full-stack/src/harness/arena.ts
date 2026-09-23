import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach } from "vitest";

/** What the fake insists on, so a relay that forgot its token is refused. */
export const ARENA_TOKEN = "an-arena-token";

export type ArenaBlock = {
  readonly id: number;
  readonly type: "Text" | "Link" | "Image" | "Attachment" | "Embed" | "Channel";
  readonly updated_at: string;
  readonly title?: string | null;
  readonly content?: { markdown: string } | null;
  readonly description?: { markdown: string } | null;
  readonly source?: { url: string } | null;
  readonly image?: {
    filename: string;
    content_type: string;
    src: string;
  } | null;
  readonly attachment?: {
    filename: string;
    content_type: string;
    url: string;
  } | null;
  readonly connection: { connected_at: string };
};

export type ArenaUpstream = {
  readonly url: string;
  /** A channel's blocks, live — created empty on first ask. A test pushes into it. */
  channel(handle: string): ArenaBlock[];
  /** The bytes behind an object storage key, as `objectUrl` names one. */
  readonly objects: Map<string, string>;
  /** Every key read, in order, so a re-read is visible. */
  readonly read: string[];
  /** The full URL a block's `image.src` or `attachment.url` should carry for this key. */
  objectUrl(key: string): string;
  stop(): Promise<void>;
};

/**
 * are.na, or enough of it: `/v3/channels/{handle}/contents`, one page, and a
 * plain object storage route neither block reads through — the same shape as
 * the fake Memos server, and for the same reason. Real HTTP on a port of the
 * operating system's choosing, because what is under test is a program that
 * speaks to a server over a socket.
 */
export function upstreamsArena(): () => Promise<ArenaUpstream> {
  const started: ArenaUpstream[] = [];

  afterEach(async () => {
    for (const each of started.splice(0)) await each.stop();
  });

  return async () => {
    const one = await serve();
    started.push(one);
    return one;
  };
}

async function serve(): Promise<ArenaUpstream> {
  const channels = new Map<string, ArenaBlock[]>();
  const objects = new Map<string, string>();
  const read: string[] = [];

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://arena.test");

    const object = /^\/objects\/(.+)$/.exec(url.pathname);
    if (object?.[1] !== undefined) {
      const key = object[1];
      const held = objects.get(key);
      if (held === undefined) {
        response.writeHead(404).end("no such object");
        return;
      }
      read.push(key);
      response
        .writeHead(200, { "content-type": "application/octet-stream" })
        .end(held);
      return;
    }

    if (request.headers.authorization !== `Bearer ${ARENA_TOKEN}`) {
      response
        .writeHead(401, { "content-type": "application/json" })
        .end(JSON.stringify({ error: { message: "unauthorized" } }));
      return;
    }

    const contents = /^\/v3\/channels\/([^/]+)\/contents$/.exec(url.pathname);
    if (contents?.[1] !== undefined) {
      const handle = decodeURIComponent(contents[1]);
      const blocks = channels.get(handle);
      if (blocks === undefined) {
        response
          .writeHead(404, { "content-type": "application/json" })
          .end(JSON.stringify({ error: { message: "no such channel" } }));
        return;
      }

      response.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          data: blocks,
          meta: { has_more_pages: false, total_pages: 1 },
        }),
      );
      return;
    }

    response.writeHead(404).end("no such thing");
  });

  const url = await listening(server);

  return {
    url,
    channel: (handle) => {
      const held = channels.get(handle);
      if (held !== undefined) return held;
      const created: ArenaBlock[] = [];
      channels.set(handle, created);
      return created;
    },
    objects,
    read,
    objectUrl: (key) => `${url}/objects/${key}`,
    stop: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function listening(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${String(port)}`);
    });
  });
}
