import type { Readable } from "node:stream";
import { TextDecoder } from "node:util";

import { Parser } from "htmlparser2";

import {
  CHARSET_SNIFF_BYTES,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_URL_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_UNFURL_BYTES,
} from "./limits";

export type Head = {
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
  readonly siteName?: string;
};

/**
 * First present wins. Open Graph is the standard; the rest are what pages that
 * never adopted it, or adopted only part of it, say instead.
 */
const TITLE = ["og:title", "twitter:title"];
const DESCRIPTION = ["og:description", "twitter:description", "description"];
const IMAGE = [
  "og:image",
  "og:image:url",
  "og:image:secure_url",
  "twitter:image",
  "twitter:image:src",
];
const SITE_NAME = ["og:site_name", "application-name"];

/**
 * What a page says about itself, read from its head and nothing after it: the
 * stream is left once `</head>` or `<body>` is reached, or at the byte cap.
 */
export async function readHead(
  body: Readable,
  contentType: string | undefined,
  base: URL,
): Promise<Head> {
  const said = new Map<string, string>();
  let imageSrc: string | undefined;
  let title: string | undefined;
  let inTitle = false;
  let done = false;

  const parser = new Parser({
    onopentag(name, attributes) {
      if (done) return;
      if (name === "body") {
        done = true;
      } else if (name === "meta") {
        const key = (attributes["property"] ?? attributes["name"])
          ?.trim()
          .toLowerCase();
        const content = attributes["content"];
        if (key !== undefined && content !== undefined && !said.has(key)) {
          said.set(key, content);
        }
      } else if (name === "link") {
        const rel = attributes["rel"]?.toLowerCase().split(/\s+/) ?? [];
        if (rel.includes("image_src")) imageSrc ??= attributes["href"];
      } else if (name === "title" && title === undefined) {
        inTitle = true;
        title = "";
      }
    },
    ontext(text) {
      if (
        !done &&
        inTitle &&
        title !== undefined &&
        title.length < MAX_TITLE_LENGTH
      ) {
        title += text;
      }
    },
    onclosetag(name) {
      if (name === "title") inTitle = false;
      if (name === "head") done = true;
    },
  });

  let decoder: TextDecoder | undefined;
  const sniffed: Buffer[] = [];
  let held = 0;
  let read = 0;

  const start = () => {
    const opening = Buffer.concat(sniffed);
    decoder = decoderFor(charsetOf(contentType) ?? declaredCharset(opening));
    parser.write(decoder.decode(opening, { stream: true }));
  };

  try {
    for await (const chunk of body as AsyncIterable<Buffer>) {
      const bytes = chunk.subarray(0, MAX_UNFURL_BYTES - read);
      read += bytes.length;
      if (decoder === undefined) {
        sniffed.push(bytes);
        held += bytes.length;
        if (held < CHARSET_SNIFF_BYTES && read < MAX_UNFURL_BYTES) continue;
        start();
      } else {
        parser.write(decoder.decode(bytes, { stream: true }));
      }
      if (done || read >= MAX_UNFURL_BYTES) break;
    }
    if (decoder === undefined) start();
    parser.end();
  } finally {
    body.destroy();
  }

  const pick = (keys: readonly string[]) =>
    keys.map((key) => said.get(key)).find((value) => value?.trim());

  const found = {
    title: text(pick(TITLE) ?? title, MAX_TITLE_LENGTH),
    description: text(pick(DESCRIPTION), MAX_DESCRIPTION_LENGTH),
    image: absolute(pick(IMAGE) ?? imageSrc, base),
    siteName: text(pick(SITE_NAME), MAX_TITLE_LENGTH),
  };
  return Object.fromEntries(
    Object.entries(found).filter(([, value]) => value !== undefined),
  ) as Head;
}

function charsetOf(contentType: string | undefined): string | undefined {
  const parameters = contentType?.split(";").slice(1) ?? [];
  for (const parameter of parameters) {
    const [name, value] = parameter.split("=");
    if (name?.trim().toLowerCase() === "charset" && value !== undefined) {
      return value.trim().replace(/^"|"$/g, "");
    }
  }
  return undefined;
}

/** `<meta charset>`, or the `http-equiv` form, in the page's opening bytes. */
function declaredCharset(opening: Buffer): string | undefined {
  let charset: string | undefined;
  const sniffer = new Parser({
    onopentag(name, attributes) {
      if (name !== "meta" || charset !== undefined) return;
      charset =
        attributes["charset"] ??
        (attributes["http-equiv"]?.toLowerCase() === "content-type"
          ? charsetOf(attributes["content"])
          : undefined);
    },
  });
  sniffer.end(opening.toString("latin1"));
  return charset?.trim();
}

function decoderFor(charset: string | undefined): TextDecoder {
  try {
    return new TextDecoder(charset ?? "utf-8");
  } catch {
    return new TextDecoder("utf-8");
  }
}

function text(raw: string | undefined, max: number): string | undefined {
  if (raw === undefined) return undefined;
  const clean = raw.replace(/\s+/g, " ").trim();
  if (clean === "") return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function absolute(raw: string | undefined, base: URL): string | undefined {
  if (raw === undefined) return undefined;
  try {
    const url = new URL(raw.trim(), base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.href.length > MAX_IMAGE_URL_LENGTH ? undefined : url.href;
  } catch {
    return undefined;
  }
}
