/**
 * A URL a destination gave us, if it is one a browser may be sent to. The
 * string comes from an adapter rather than a person, but it reaches an `href`
 * either way, and `javascript:` in one is script running on this origin.
 */
export function followable(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? url
      : undefined;
  } catch {
    // Not a URL at all: a pointer is a path a person recognises, and this is
    // the field that was supposed to be more than that.
    return undefined;
  }
}
