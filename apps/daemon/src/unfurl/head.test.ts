import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { readHead } from "./head";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_URL_LENGTH,
  MAX_UNFURL_BYTES,
} from "./limits";

const BASE = new URL("https://example.org/posts/one");
const HTML = "text/html; charset=utf-8";

function page(...chunks: readonly (string | Buffer)[]): Readable {
  return Readable.from(
    chunks.map((chunk) =>
      typeof chunk === "string" ? Buffer.from(chunk) : chunk,
    ),
  );
}

/** Counts what was pulled, so a test can say how much of a page was read. */
function counted(chunks: readonly Buffer[]) {
  let pulled = 0;
  const body = Readable.from(
    (function* () {
      for (const chunk of chunks) {
        pulled += chunk.length;
        yield chunk;
      }
    })(),
  );
  return { body, pulled: () => pulled };
}

const read = (html: string, contentType = HTML) =>
  readHead(page(html), contentType, BASE);

describe("readHead", () => {
  it("reads the four Open Graph properties", async () => {
    expect(
      await read(`<html><head>
        <meta property="og:title" content="A title">
        <meta content="What it is about" property="og:description" />
        <meta property='og:image' content='https://cdn.example.org/a.jpg'>
        <meta property="og:site_name" content="Example">
        <title>Not this</title>
      </head><body></body></html>`),
    ).toEqual({
      title: "A title",
      description: "What it is about",
      image: "https://cdn.example.org/a.jpg",
      siteName: "Example",
    });
  });

  it("falls back where Open Graph is missing", async () => {
    expect(
      await read(`<head>
        <title> Just  a
          title </title>
        <meta name="description" content="Plain description">
        <link rel="image_src" href="/cover.png">
        <meta name="application-name" content="Plain Site">
      </head>`),
    ).toEqual({
      title: "Just a title",
      description: "Plain description",
      image: "https://example.org/cover.png",
      siteName: "Plain Site",
    });
  });

  it("prefers Twitter's tags to the plain ones, and Open Graph to both", async () => {
    expect(
      await read(`<head>
        <title>plain</title>
        <meta name="description" content="plain">
        <meta name="twitter:title" content="twitter">
        <meta name="twitter:description" content="twitter">
        <meta name="twitter:image" content="https://t.example/i.png">
        <meta property="og:description" content="og">
      </head>`),
    ).toEqual({
      title: "twitter",
      description: "og",
      image: "https://t.example/i.png",
    });
  });

  it("takes the image from og:image:url where og:image is absent", async () => {
    expect(
      await read(
        `<meta property="og:image:secure_url" content="https://s.example/b.png"><meta property="og:image:url" content="https://s.example/a.png">`,
      ),
    ).toEqual({ image: "https://s.example/a.png" });
  });

  it("answers nothing where the page says nothing", async () => {
    expect(await read("<html><body>hi</body></html>")).toEqual({});
  });

  it("drops an image that is not http or https, or is too long to be one", async () => {
    expect(
      await read(`<meta property="og:image" content="javascript:alert(1)">`),
    ).toEqual({});
    const long = `https://example.org/${"a".repeat(MAX_IMAGE_URL_LENGTH)}`;
    expect(await read(`<meta property="og:image" content="${long}">`)).toEqual(
      {},
    );
  });

  it("decodes entities, named and numbered", async () => {
    expect(
      await read(
        `<meta property="og:title" content="Tom &amp; Jerry &#8212; &#x2014; &mdash; caf&eacute;">`,
      ),
    ).toEqual({ title: "Tom & Jerry — — — café" });
  });

  it("reads a quoted > inside an attribute as part of it", async () => {
    expect(
      await read(`<meta property="og:description" content="a > b, c < d">`),
    ).toEqual({ description: "a > b, c < d" });
  });

  it("ignores what sits in a comment or a script", async () => {
    expect(
      await read(`<head>
        <!-- <meta property="og:title" content="commented"> -->
        <script>document.write('<meta property="og:title" content="scripted"></head>')</script>
        <meta property="og:title" content="real">
      </head>`),
    ).toEqual({ title: "real" });
  });

  it("stops at the body", async () => {
    expect(
      await read(
        `<head></head><body><meta property="og:title" content="late"><title>late</title></body>`,
      ),
    ).toEqual({});
  });

  it("stops reading once the head is over", async () => {
    const { body, pulled } = counted([
      Buffer.from(`<head><title>early</title></head>`),
      ...Array.from({ length: 50 }, () => Buffer.alloc(64 * 1024, "x")),
    ]);

    expect(await readHead(body, HTML, BASE)).toEqual({ title: "early" });
    expect(pulled()).toBeLessThan(4 * 64 * 1024);
  });

  it("stops at the byte cap where the head never ends", async () => {
    const { body, pulled } = counted(
      Array.from({ length: 50 }, () => Buffer.alloc(64 * 1024, "x")),
    );

    await readHead(body, HTML, BASE);
    expect(pulled()).toBeLessThanOrEqual(MAX_UNFURL_BYTES + 64 * 1024);
  });

  it.each([
    ["<meta ", "an unclosed meta"],
    ["<title>", "an unclosed title"],
    ['<meta content="', "an unclosed attribute"],
    ["<!--", "an unclosed comment"],
  ])("reads a hostile page of %j repeated in linear time", async (unit) => {
    const hostile = unit.repeat(Math.ceil(MAX_UNFURL_BYTES / unit.length));
    const started = performance.now();

    await read(hostile);

    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("cuts a long description short", async () => {
    const { description = "" } = await read(
      `<meta property="og:description" content="${"word ".repeat(400)}">`,
    );
    expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith("…")).toBe(true);
  });

  it("decodes the charset the response names", async () => {
    expect(
      await readHead(
        page(Buffer.from("<title>caf\xe9</title>", "latin1")),
        "text/html; charset=iso-8859-1",
        BASE,
      ),
    ).toEqual({ title: "café" });
  });

  it("decodes the charset the page declares, where the response did not", async () => {
    for (const declared of [
      `<meta charset="iso-8859-1">`,
      `<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">`,
    ]) {
      expect(
        await readHead(
          page(Buffer.from(`${declared}<title>caf\xe9</title>`, "latin1")),
          "text/html",
          BASE,
        ),
      ).toEqual({ title: "café" });
    }
  });

  it("keeps a character split across two chunks whole", async () => {
    const bytes = Buffer.from(`<!--${"a".repeat(2000)}--><title>café</title>`);
    const cut = bytes.indexOf(0xa9);

    expect(
      await readHead(
        page(bytes.subarray(0, cut), bytes.subarray(cut)),
        HTML,
        BASE,
      ),
    ).toEqual({ title: "café" });
  });
});
