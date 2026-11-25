import { answered, SHARED_TO, WAITED } from "./answer";

/** The prefix every build's caches share, the build's version after it. */
export const SHELL_PREFIX = "notemap-shell-";

/** The page every route is drawn from: the daemon answers it for any path. */
export const PAGE = "/";

/** The kept shell, where a page asked for while the daemon does not answer is drawn from. */
export type Shell = Pick<Cache, "match">;

/**
 * A page from the daemon, or the shell kept where it does not answer in time
 * or answers with a gateway error. The wait covers the answer's head only: a
 * page arriving slowly is still a page.
 */
export async function page(
  request: Request,
  shell: () => Promise<Shell>,
  asked: typeof fetch = fetch,
  waited: number = WAITED,
): Promise<Response> {
  const giving = new AbortController();
  const timer = setTimeout(() => giving.abort(), waited);
  try {
    const response = await asked(request, { signal: giving.signal });
    if (answered(response)) return response;
  } catch {
    // Not answering is what the kept page is for.
  } finally {
    clearTimeout(timer);
  }
  return (await (await shell()).match(PAGE)) ?? Response.error();
}

/**
 * Holds a share for the capture page and sends the app there. Only a page
 * the person is looking at shares: a post from a frame inside another site
 * is refused, as it could only be one nobody saw. One that cannot be held is
 * still sent to the page, which says so.
 */
export async function share(
  request: Request,
  hold: (form: FormData) => Promise<void>,
): Promise<Response> {
  if (request.destination !== "document") {
    return new Response(null, { status: 403 });
  }
  const to = new URL(SHARED_TO, request.url);
  try {
    await hold(await request.formData());
    to.search = "shared";
  } catch {
    to.search = "shared=failed";
  }
  return Response.redirect(to.href, 303);
}

function versionOf(name: string): string {
  return name.slice(SHELL_PREFIX.length);
}

/** Newest first: a build's version is the time it was built. */
function newer(a: string, b: string): number {
  const [x, y] = [Number(versionOf(a)), Number(versionOf(b))];
  return Number.isNaN(x) || Number.isNaN(y)
    ? versionOf(b).localeCompare(versionOf(a))
    : y - x;
}

/**
 * The caches a newly active build lets go of: every older build's but the one
 * before it, which a page still drawn from that build may yet need a file of.
 */
export function stale(names: readonly string[], current: string): string[] {
  const older = names
    .filter((name) => name.startsWith(SHELL_PREFIX) && name !== current)
    .sort(newer);
  return older.slice(1);
}
