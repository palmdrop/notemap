import type { Attachment } from "@notemap/client";

/** How many pictures an item draws before the rest are lines. */
export const PICTURED = 2;

export function isImage(attachment: Pick<Attachment, "mime">): boolean {
  return attachment.mime?.startsWith("image/") ?? false;
}

/** The first images in slot order are drawn as pictures; everything else is a line. */
export function drawn(attachments: readonly Attachment[]): {
  readonly pictures: readonly Attachment[];
  readonly lines: readonly Attachment[];
} {
  const pictures = attachments.filter(isImage).slice(0, PICTURED);
  return {
    pictures,
    lines: attachments.filter((each) => !pictures.includes(each)),
  };
}

export function nameOf(attachment: Pick<Attachment, "filename">): string {
  return attachment.filename ?? "attachment";
}

/** How much of a name's end is kept whole when it is cut, enough to hold its extension. */
export const KEPT_END = 12;

/** A name as the part that may be cut and the end that never is. */
export function endKept(name: string): {
  readonly head: string;
  readonly end: string;
} {
  const at = Math.max(0, name.length - KEPT_END);
  return { head: name.slice(0, at), end: name.slice(at) };
}

const UNITS = ["KB", "MB", "GB"];

/** Decimal units, as a file manager says them. */
export function sizeOf(bytes: number): string {
  if (bytes < 1000) return bytes === 1 ? "1 byte" : `${String(bytes)} bytes`;

  let size = bytes / 1000;
  for (let unit = 0; ; unit += 1) {
    // One decimal while it still says something, and never a size that rounds
    // up to the next unit's first.
    const shown = size < 9.95 ? size.toFixed(1) : String(Math.round(size));
    if (Number(shown) < 1000 || unit === UNITS.length - 1) {
      return `${shown} ${UNITS[unit] ?? ""}`;
    }
    size /= 1000;
  }
}
