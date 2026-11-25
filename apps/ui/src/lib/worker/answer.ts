/** Where the capture page is, and where a share is posted. */
export const SHARED_TO = "/capture";

/**
 * What the worker does with a request: a file it keeps, a page drawn from the
 * shell it keeps when the daemon cannot answer, a share to hold for the
 * capture page, or the network as if there were no worker at all.
 */
export type Answer = "kept" | "shell" | "share" | "network";

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
  // A page is asked of the daemon first, kept or not, or a newer build could
  // never reach it.
  if (asked.mode === "navigate") return "shell";
  return kept.has(url.pathname) ? "kept" : "network";
}

/**
 * How long a page waits on the daemon before it is drawn from what is kept. A
 * daemon out of reach from where the phone is tends to hang rather than refuse.
 */
export const WAITED = 4_000;

/**
 * A proxy in front of a daemon that is down still answers, with a gateway
 * error, and that is the daemon not answering.
 */
export function answered(response: Response): boolean {
  return response.status < 500;
}
