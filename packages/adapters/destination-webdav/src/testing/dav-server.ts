import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A DAV server standing in for Nextcloud, in this process and in memory.
 *
 * It is a **fake**, and the parts of DAV it implements are the parts this
 * adapter uses: conditional `PUT`, `MKCOL` a level at a time, `GET` with an
 * `ETag`, and `PROPFIND` answering whether something is there and whether it is
 * a collection. Whether the real thing agrees is what the hand verification against a
 * real instance is for; nothing here can answer it.
 */
export type DavServer = {
  readonly url: string;
  /** The collection everything is rooted at, as a destination's account would name it. */
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  /** Every file, path to content, so a test reads the vault as one value. */
  files(): Record<string, string>;
  collections(): readonly string[];
  /** Puts a file there without going through the API, for a vault that already had one. */
  put(path: string, content: string): void;
  makeCollection(path: string): void;
  /** What arrived, in order, as `METHOD /path`. */
  requests(): readonly string[];
  /**
   * Whether the body at that path arrived chunked rather than under a
   * `Content-Length`, which is what says it was streamed and not buffered up to
   * be measured first.
   */
  arrivedChunked(path: string): boolean;
  /**
   * Run before the named method is handled, once per matching request. This is
   * how a test writes into the vault between somebody's read and their write.
   */
  interceptOnce(method: string, run: () => void): void;
  /**
   * Answer every `GET` with a weak validator from here on, as a proxy
   * compressing responses does. Nothing can then match `If-Match`.
   */
  weakenEtags(): void;
  close(): Promise<void>;
};

type Entry =
  | { readonly kind: "collection" }
  | { kind: "file"; content: string; version: number };

const BASE = "dav";

export async function startDavServer(): Promise<DavServer> {
  const username = "alice";
  const password = "an-app-password";
  const expected = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;

  const tree = new Map<string, Entry>([["", { kind: "collection" }]]);
  const seen: string[] = [];
  const chunked = new Set<string>();
  const intercepts = new Map<string, Array<() => void>>();

  let versions = 0;
  let weak = false;
  const etagOf = (entry: Entry & { kind: "file" }): string =>
    `${weak ? "W/" : ""}"v${entry.version}"`;

  const server = createServer((request, response) => {
    const method = request.method ?? "GET";
    const path = pathOf(request.url ?? "/");

    if (path === undefined) {
      response.writeHead(400).end();
      return;
    }

    seen.push(`${method} /${path}`);
    if (request.headers["transfer-encoding"] === "chunked") chunked.add(path);

    if (request.headers.authorization !== expected) {
      response.writeHead(401, { "www-authenticate": "Basic" }).end();
      return;
    }

    const waiting = intercepts.get(method);
    if (waiting !== undefined && waiting.length > 0) waiting.shift()?.();

    const entry = tree.get(path);

    if (method === "GET") {
      if (entry === undefined || entry.kind !== "file") {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { etag: etagOf(entry) }).end(entry.content);
      return;
    }

    if (method === "PROPFIND") {
      if (entry === undefined) {
        response.writeHead(404).end();
        return;
      }
      // Namespace-prefixed, as Nextcloud answers: a caller reading this must
      // not be written against the one spelling a bare `DAV:` default gives.
      const resourceType = entry.kind === "collection" ? "<d:collection/>" : "";
      response
        .writeHead(207, { "content-type": "application/xml; charset=utf-8" })
        .end(
          `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/${BASE}/${path}</d:href><d:propstat><d:prop><d:resourcetype>${resourceType}</d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,
        );
      return;
    }

    if (method === "MKCOL") {
      if (entry !== undefined) {
        response.writeHead(405).end();
        return;
      }
      if (!hasParent(tree, path)) {
        response.writeHead(409).end();
        return;
      }
      tree.set(path, { kind: "collection" });
      response.writeHead(201).end();
      return;
    }

    if (method === "PUT") {
      if (entry?.kind === "collection") {
        response.writeHead(405).end();
        return;
      }
      if (!hasParent(tree, path)) {
        response.writeHead(409).end();
        return;
      }

      const ifNoneMatch = request.headers["if-none-match"];
      const ifMatch = request.headers["if-match"];

      if (ifNoneMatch === "*" && entry !== undefined) {
        response.writeHead(412).end();
        return;
      }
      if (typeof ifMatch === "string") {
        if (entry === undefined || etagOf(entry) !== ifMatch) {
          response.writeHead(412).end();
          return;
        }
      }

      void read(request).then((content) => {
        versions += 1;
        tree.set(path, { kind: "file", content, version: versions });
        response.writeHead(entry === undefined ? 201 : 204).end();
      });
      return;
    }

    response.writeHead(405).end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const write = (path: string, content: string): void => {
    versions += 1;
    tree.set(trim(path), { kind: "file", content, version: versions });
  };

  return {
    url,
    baseUrl: `${url}/${BASE}`,
    username,
    password,

    files: () => {
      const held: Array<{ path: string; content: string }> = [];
      for (const [path, entry] of tree) {
        if (entry.kind === "file") held.push({ path, content: entry.content });
      }
      held.sort((a, b) => (a.path < b.path ? -1 : 1));

      return Object.fromEntries(held.map((each) => [each.path, each.content]));
    },

    collections: () =>
      [...tree]
        .filter(([, entry]) => entry.kind === "collection")
        .map(([path]) => path)
        .sort(),

    put: (path, content) => {
      for (const collection of above(trim(path))) {
        if (!tree.has(collection)) tree.set(collection, { kind: "collection" });
      }
      write(path, content);
    },

    makeCollection: (path) => {
      for (const collection of [...above(trim(path)), trim(path)]) {
        if (!tree.has(collection)) tree.set(collection, { kind: "collection" });
      }
    },

    requests: () => [...seen],

    arrivedChunked: (path) => chunked.has(trim(path)),

    weakenEtags: () => {
      weak = true;
    },

    interceptOnce: (method, run) => {
      const waiting = intercepts.get(method) ?? [];
      waiting.push(run);
      intercepts.set(method, waiting);
    },

    close: () => closed(server),
  };
}

/** The path below the base collection, decoded, with no leading or trailing slash. */
function pathOf(target: string): string | undefined {
  const decoded = decodeURIComponent(target.split("?")[0] ?? "");
  const trimmed = trim(decoded);

  if (trimmed === BASE) return "";
  if (!trimmed.startsWith(`${BASE}/`)) return undefined;
  return trimmed.slice(BASE.length + 1);
}

function trim(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

function above(path: string): readonly string[] {
  const segments = path.split("/").filter((segment) => segment !== "");
  return segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join("/"));
}

function hasParent(tree: ReadonlyMap<string, Entry>, path: string): boolean {
  const at = path.lastIndexOf("/");
  const parent = at < 0 ? "" : path.slice(0, at);
  return tree.get(parent)?.kind === "collection";
}

async function read(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function closed(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
