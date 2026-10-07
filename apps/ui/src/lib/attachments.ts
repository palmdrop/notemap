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

const UNITS = ["KB", "MB", "GB"];

/** Decimal units, as a file manager says them. */
export function sizeOf(bytes: number): string {
  if (bytes < 1000) return `${String(bytes)} bytes`;

  let size = bytes / 1000;
  let unit = 0;
  while (size >= 1000 && unit < UNITS.length - 1) {
    size /= 1000;
    unit += 1;
  }
  return `${size < 10 ? size.toFixed(1) : String(Math.round(size))} ${UNITS[unit] ?? ""}`;
}
