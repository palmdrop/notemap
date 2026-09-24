import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { pinnedFetch } from "./fetch";
import { MAX_UNFURL_BYTES } from "./limits";

const LOOPBACK = { address: "127.0.0.1", family: 4 } as const;

let server: Server | undefined;

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
  server = undefined;
});

async function serving(
  handle: Parameters<typeof createServer>[1],
): Promise<number> {
  server = createServer(handle);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return (server?.address() as AddressInfo).port;
}

describe("pinnedFetch", () => {
  it("connects to the pinned address and keeps the name for Host", async () => {
    let seen: IncomingHttpHeaders | undefined;
    const port = await serving((request, response) => {
      seen = request.headers;
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<title>here</title>");
    });

    // `.invalid` never resolves, so reaching the server at all is the pinning.
    const fetched = await pinnedFetch(
      new URL(`http://unfurl.invalid:${port}/page`),
      LOOPBACK,
      new AbortController().signal,
    );

    expect(fetched.status).toBe(200);
    expect(fetched.body).toBe("<title>here</title>");
    expect(seen?.host).toBe(`unfurl.invalid:${port}`);
  });

  it("answers a redirect without following it", async () => {
    const port = await serving((_request, response) => {
      response.statusCode = 302;
      response.setHeader("location", "http://elsewhere.invalid/");
      response.end("moved");
    });

    const fetched = await pinnedFetch(
      new URL(`http://unfurl.invalid:${port}/`),
      LOOPBACK,
      new AbortController().signal,
    );

    expect(fetched).toMatchObject({
      status: 302,
      location: "http://elsewhere.invalid/",
      body: "",
    });
  });

  it("cuts an oversized body short", async () => {
    const port = await serving((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end("a".repeat(MAX_UNFURL_BYTES * 3));
    });

    const fetched = await pinnedFetch(
      new URL(`http://unfurl.invalid:${port}/`),
      LOOPBACK,
      new AbortController().signal,
    );

    expect(fetched.body.length).toBe(MAX_UNFURL_BYTES);
  });

  it("caps what a compressed body unpacks to", async () => {
    const port = await serving((_request, response) => {
      response.setHeader("content-type", "text/html");
      response.setHeader("content-encoding", "gzip");
      response.end(gzipSync("b".repeat(MAX_UNFURL_BYTES * 4)));
    });

    const fetched = await pinnedFetch(
      new URL(`http://unfurl.invalid:${port}/`),
      LOOPBACK,
      new AbortController().signal,
    );

    expect(fetched.body.length).toBe(MAX_UNFURL_BYTES);
    expect(fetched.body.startsWith("bbbb")).toBe(true);
  });

  it("decodes the charset the response names", async () => {
    const port = await serving((_request, response) => {
      response.setHeader("content-type", "text/html; charset=iso-8859-1");
      response.end(Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    });

    const fetched = await pinnedFetch(
      new URL(`http://unfurl.invalid:${port}/`),
      LOOPBACK,
      new AbortController().signal,
    );

    expect(fetched.body).toBe("café");
  });

  it("gives up when the signal is aborted", async () => {
    const port = await serving(() => undefined);
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
