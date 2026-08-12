/**
 * By inertness, not by image-ness. Anything may be uploaded; the list decides
 * only whether a browser is allowed to render it in place, so a media type
 * nobody has thought about yet downloads rather than executes.
 *
 * `text/plain` is on it and `image/svg+xml` is not, which is the whole point:
 * SVG is a document with a script element.
 */
const INLINE = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/flac",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "text/plain",
]);

/** The type and subtype alone: `text/plain; charset=utf-8` is `text/plain`. */
export function essence(mime: string): string {
  return (mime.split(";")[0] ?? "").trim().toLowerCase();
}

export function dispositionFor(mime: string): "inline" | "attachment" {
  return INLINE.has(essence(mime)) ? "inline" : "attachment";
}
