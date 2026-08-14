/**
 * `Content-Disposition`, both ways (RFC 6266).
 *
 * A filename is user data and has to survive the round trip, so the extended
 * `filename*` form is what is read first and what is always written — plain
 * `filename` cannot carry anything outside ASCII.
 */

const EXTENDED = /filename\*\s*=\s*([^;]+)/i;
const QUOTED = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i;
const BARE = /filename\s*=\s*([^;"\s]+)/i;

export function filenameFrom(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;

  const extended = EXTENDED.exec(header)?.[1]?.trim();
  if (extended !== undefined) {
    const decoded = decodeExtended(extended);
    if (decoded !== undefined) return sanitised(decoded);
  }

  const quoted = QUOTED.exec(header)?.[1];
  if (quoted !== undefined) return sanitised(quoted.replace(/\\(.)/g, "$1"));

  const bare = BARE.exec(header)?.[1];
  return bare === undefined ? undefined : sanitised(bare);
}

/** `UTF-8''na%C3%AFve`. A charset notemap cannot decode is not a filename it can keep. */
function decodeExtended(value: string): string | undefined {
  const [charset, , encoded] = value.split("'");
  if (charset?.toLowerCase() !== "utf-8" || encoded === undefined) {
    return undefined;
  }

  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

/**
 * A filename is stored and served, never resolved against a filesystem — blobs
 * are named by their hash — but it is still worth refusing a name carrying a
 * path, since every consumer of the download will hand it to a save dialog.
 */
function sanitised(value: string): string | undefined {
  const name = [...value]
    .filter((character) => character.codePointAt(0)! > 0x1f)
    .join("")
    .replace(/[\\/]/g, "");
  return name === "" || name === "." || name === ".." ? undefined : name;
}

/**
 * Both spellings: the ASCII one for anything that only reads `filename`, and
 * the extended one, which wins wherever both are understood.
 */
export function contentDisposition(
  disposition: "inline" | "attachment",
  filename: string,
): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
