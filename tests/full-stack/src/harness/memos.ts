import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach } from "vitest";

/** What the fake insists on, so a relay that forgot its token is refused. */
export const MEMOS_TOKEN = "a-memos-token";

export type Attached = {
  readonly name: string;
  readonly filename: string;
  readonly type: string;
};

export type Memo = {
  readonly name: string;
  readonly content: string;
  readonly createTime: string;
  readonly updateTime: string;
  readonly tags?: readonly string[];
  readonly attachments?: readonly Attached[];
};

export type Upstream = {
  readonly url: string;
  /** What the server answers with. A test edits it between polls. */
  readonly memos: Memo[];
  /** The bytes behind an attachment, by its name. */
  readonly bytes: Map<string, string>;
  /** Every attachment read, in order, so a re-read is visible. */
  readonly read: string[];
  /** Every CEL filter it was asked to list under. */
  readonly filters: string[];
  stop(): Promise<void>;
};

/**
 * A Memos server that is not one: enough of `/api/v1` for a relay to read
 * everything and fetch what hangs off it. Real HTTP on a port of the operating
 * system's choosing, because what is under test is a program that speaks to a
 * server over a socket.
 */
export function upstreams(): () => Promise<Upstream> {
  const started: Upstream[] = [];

  afterEach(async () => {
    for (const each of started.splice(0)) await each.stop();
  });

  return async () => {
    const one = await serve();
    started.push(one);
    return one;
  };
}

async function serve(): Promise<Upstream> {
  const memos: Memo[] = [];
  const bytes = new Map<string, string>();
  const read: string[] = [];
  const filters: string[] = [];

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://memos.test");
    const carried = request.headers.authorization === `Bearer ${MEMOS_TOKEN}`;

    if (!carried) {
      response.writeHead(401).end("who are you");
      return;
    }

    if (url.pathname === "/api/v1/auth/me") {
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ user: { name: "users/1" } }));
      return;
    }

    if (url.pathname === "/api/v1/memos") {
      filters.push(url.searchParams.get("filter") ?? "");
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ memos }));
      return;
    }

    const file = /^\/file\/(attachments\/[^/]+)\//.exec(url.pathname);
    const held = file?.[1] === undefined ? undefined : bytes.get(file[1]);
    if (file?.[1] !== undefined && held !== undefined) {
      read.push(file[1]);
      response
        .writeHead(200, { "content-type": "application/octet-stream" })
        .end(held);
      return;
    }

    response.writeHead(404).end("no such thing");
  });

  const url = await listening(server);

  return {
    url,
    memos,
    bytes,
    read,
    filters,
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
