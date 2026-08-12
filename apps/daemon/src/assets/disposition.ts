/**
 * By inertness, not by image-ness: anything absent from this list downloads
 * rather than rendering, so a media type nobody has considered yet cannot
 * execute. `image/svg+xml` is deliberately not on it.
 */
const INLINE = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/vnd.wave",
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
