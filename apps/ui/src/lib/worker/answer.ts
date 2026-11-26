/** Where the capture page is, and where a share is posted. */
export const SHARED_TO = "/capture";

/**
 * What the worker does with a request: a file it keeps, a page drawn from the
 * shell it keeps, a share to hold for the
 * capture page, a file of an earlier build that a page drawn from it still
 * asks for, or the network as if there were no worker at all.
 */
export type Answer = "kept" | "shell" | "share" | "older" | "network";

export type Asked = {
  readonly method: string;
  readonly url: string;
  readonly mode: RequestMode;
};

function theDaemons(path: string): boolean {
  return ["/v1", "/docs"].some(
    (root) => path === root || path.startsWith(`${root}/`),
  );
}

export function answerFor(
  asked: Asked,
  origin: string,
  kept: ReadonlySet<string>,
): Answer {
  const url = new URL(asked.url);
  if (url.origin !== origin || theDaemons(url.pathname)) return "network";
  if (asked.method === "POST" && url.pathname === SHARED_TO) return "share";
  if (asked.method !== "GET") return "network";
  if (asked.mode === "navigate") return "shell";
  if (kept.has(url.pathname)) return "kept";
  return url.pathname.startsWith("/_app/immutable/") ? "older" : "network";
}
