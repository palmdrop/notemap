import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from "./limits";

type Extracted = {
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
  readonly siteName?: string;
};

const NAMED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  bull: "•",
  copy: "©",
};

/** Open Graph's four, and the document's `<title>` where `og:title` is missing. */
export function extract(html: string, base: URL): Extracted {
  const end = html.search(/<\/head\s*>/i);
  const head = end === -1 ? html : html.slice(0, end);

  const properties = new Map<string, string>();
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = attributesOf(tag);
    const property = (attributes.get("property") ?? attributes.get("name"))
      ?.trim()
      .toLowerCase();
    const content = attributes.get("content");
    if (property === undefined || content === undefined) continue;
    if (!properties.has(property)) properties.set(property, content);
  }

  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head)?.[1];

  const title = text(properties.get("og:title") ?? titleTag, MAX_TITLE_LENGTH);
  const description = text(
    properties.get("og:description"),
    MAX_DESCRIPTION_LENGTH,
  );
  const siteName = text(properties.get("og:site_name"), MAX_TITLE_LENGTH);
  const image = absolute(properties.get("og:image"), base);

  return {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(image === undefined ? {} : { image }),
    ...(siteName === undefined ? {} : { siteName }),
  };
}

function attributesOf(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(
    /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
  )) {
    const [, name, double, single, bare] = match;
    if (name === undefined) continue;
    attributes.set(name.toLowerCase(), double ?? single ?? bare ?? "");
  }
  return attributes;
}

function text(raw: string | undefined, max: number): string | undefined {
  if (raw === undefined) return undefined;
  const clean = decodeEntities(raw).replace(/\s+/g, " ").trim();
  if (clean === "") return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function absolute(raw: string | undefined, base: URL): string | undefined {
  if (raw === undefined) return undefined;
  try {
    const url = new URL(decodeEntities(raw).trim(), base);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (whole, entity: string) => {
      if (entity.startsWith("#")) {
        const code =
          entity[1] === "x" || entity[1] === "X"
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole;
      }
      return NAMED[entity.toLowerCase()] ?? whole;
    },
  );
}
