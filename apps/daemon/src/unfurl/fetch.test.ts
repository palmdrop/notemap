import { readFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { createServer as createTlsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import type { TLSSocket } from "node:tls";
import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { createPinnedFetch, pinnedFetch } from "./fetch";

const LOOPBACK = { address: "127.0.0.1", family: 4 } as const;
const TLS = join(import.meta.dirname, "../testing/tls");
const CERT = readFileSync(join(TLS, "unfurl.test.crt"), "utf8");
const KEY = readFileSync(join(TLS, "unfurl.test.key"), "utf8");

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
  server = undefined;
});

async function listening(serving: Server): Promise<number> {
  server = serving;
  await new Promise<void>((resolve) => serving.listen(0, "127.0.0.1", resolve));
  return (serving.address() as AddressInfo).port;
}

const never = () => new AbortController().signal;

describe("pinnedFetch", () => {
  it("connects to the pinned address and keeps the name for Host", async () => {
    let seen: IncomingHttpHeaders | undefined;
    const port = await listening(
      createServer((request, response) => {
        seen = request.headers;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end("<title>here</title>");
      }),
    );

    // `.invalid` never resolves, so reaching the server at all is the pinning.
    const fetched = await pinnedFetch(
      new URL(`http://unfurl.invalid:${port}/page`),
      LOOPBACK,
      never(),
    );

    expect(fetched.status).toBe(200);
    expect(fetched.contentType).toBe("text/html; charset=utf-8");
    expect(await text(fetched.body!)).toBe("<title>here</title>");
    expect(seen?.host).toBe(`unfurl.invalid:${port}`);
  });

  it("answers a redirect without following it, and with no body", async () => {
    const port = await listening(
      createServer((_request, response) => {
        response.statusCode = 302;
        response.setHeader("location", "http://elsewhere.invalid/");
        response.end("moved");
      }),
    );

    const fetched = await pinnedFetch(
      new URL(`http://unfurl.invalid:${port}/`),
      LOOPBACK,
      never(),
    );

    expect(fetched).toEqual({
      status: 302,
      location: "http://elsewhere.invalid/",
    });
  });

  it("undoes a content-encoding", async () => {
    const port = await listening(
      createServer((_request, response) => {
        response.setHeader("content-type", "text/html");
        response.setHeader("content-encoding", "gzip");
        response.end(gzipSync("<title>packed</title>"));
      }),
    );

    const fetched = await pinnedFetch(
      new URL(`http://unfurl.invalid:${port}/`),
      LOOPBACK,
      never(),
    );

    expect(await text(fetched.body!)).toBe("<title>packed</title>");
  });

  it("lets go of the connection when the body is destroyed unread", async () => {
    let closed!: () => void;
    const gone = new Promise<void>((resolve) => (closed = resolve));
    const port = await listening(
      createServer((request, response) => {
        request.socket.on("close", closed);
        response.setHeader("content-type", "text/html");
        response.write("<html>");
      }),
    );

    const fetched = await pinnedFetch(
      new URL(`http://unfurl.invalid:${port}/`),
      LOOPBACK,
      never(),
    );
    fetched.body?.destroy();

    await gone;
  });

  it("gives up when the signal is aborted", async () => {
    const port = await listening(createServer(() => undefined));
    const controller = new AbortController();

    const fetching = pinnedFetch(
      new URL(`http://unfurl.invalid:${port}/`),
      LOOPBACK,
      controller.signal,
    );
    controller.abort();

    await expect(fetching).rejects.toThrow();
  });
});

describe("pinnedFetch over TLS", () => {
  async function tls(): Promise<{ port: number; names: string[] }> {
    const names: string[] = [];
    const port = await listening(
      createTlsServer({ cert: CERT, key: KEY }, (request, response) => {
        names.push((request.socket as TLSSocket).servername || "");
        response.setHeader("content-type", "text/html");
        response.end("<title>secure</title>");
      }) as unknown as Server,
    );
    return { port, names };
  }

  it("sends the name for SNI and checks the certificate against it", async () => {
    const { port, names } = await tls();
    const trusting = createPinnedFetch({ ca: CERT });

    const fetched = await trusting(
      new URL(`https://unfurl.test:${port}/`),
      LOOPBACK,
      never(),
    );

    expect(await text(fetched.body!)).toBe("<title>secure</title>");
    expect(names).toEqual(["unfurl.test"]);
  });

  it("refuses a certificate for another name, pinned to the same address", async () => {
    const { port } = await tls();
    const trusting = createPinnedFetch({ ca: CERT });

    await expect(
      trusting(new URL(`https://elsewhere.test:${port}/`), LOOPBACK, never()),
    ).rejects.toThrow(/altnames|Hostname/i);
  });

  it("refuses a certificate nobody trusts", async () => {
    const { port } = await tls();

    await expect(
      pinnedFetch(new URL(`https://unfurl.test:${port}/`), LOOPBACK, never()),
    ).rejects.toThrow(/self[- ]signed/i);
  });
});
