import { describe, expect, it, vi } from "vitest";

import { page, share, stale } from "./respond";

const KEPT = new Response("the kept shell");
const shell = () =>
  Promise.resolve({
    match: (asked: RequestInfo | URL) =>
      Promise.resolve(asked === "/" ? KEPT.clone() : undefined),
  });
const going = new Request("https://notes.example/feed");

describe("a page asked for", () => {
  it("is the daemon's where it answers", async () => {
    const answer = await page(going, shell, () =>
      Promise.resolve(new Response("from the daemon")),
    );
    expect(await answer.text()).toBe("from the daemon");
  });

  it("is the kept shell where the daemon cannot be reached", async () => {
    const answer = await page(going, shell, () =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    expect(await answer.text()).toBe("the kept shell");
  });

  it("is the kept shell where a proxy answers for a daemon that is down", async () => {
    const answer = await page(going, shell, () =>
      Promise.resolve(new Response("bad gateway", { status: 502 })),
    );
    expect(await answer.text()).toBe("the kept shell");
  });

  it("is the kept shell where the daemon does not answer in time", async () => {
    const hanging = (_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("gone")),
        );
      });
    const answer = await page(going, shell, hanging, 10);
    expect(await answer.text()).toBe("the kept shell");
  });

  it("is not cut off once the daemon has started answering", async () => {
    let signal: AbortSignal | undefined;
    await page(
      going,
      shell,
      (_, init) => {
        signal = init?.signal ?? undefined;
        return Promise.resolve(new Response("from the daemon"));
      },
      10,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(signal?.aborted).toBe(false);
  });
});

/** A share as Chrome posts one, from the system sheet or from a page. */
function posted(destination: RequestDestination): Request {
  const request = new Request("https://notes.example/capture", {
    method: "POST",
    body: new FormData(),
  });
  Object.defineProperty(request, "destination", { value: destination });
  return request;
}

describe("a share posted", () => {
  it("is held, and sends the app to the capture page", async () => {
    const hold = vi.fn(() => Promise.resolve());
    const answer = await share(posted("document"), hold);

    expect(hold).toHaveBeenCalledOnce();
    expect(answer.status).toBe(303);
    expect(answer.headers.get("location")).toContain("/capture?shared");
  });

  it("that cannot be held still reaches the capture page, which says so", async () => {
    const answer = await share(posted("document"), () =>
      Promise.reject(new Error("quota")),
    );

    expect(answer.status).toBe(303);
    expect(answer.headers.get("location")).toContain("/capture?shared=failed");
  });

  it("from a frame inside another page is refused, and nothing is held", async () => {
    const hold = vi.fn(() => Promise.resolve());
    const answer = await share(posted("iframe"), hold);

    expect(hold).not.toHaveBeenCalled();
    expect(answer.status).toBe(403);
  });
});

describe("what a new build lets go of", () => {
  it("is every older build's cache but the one before it", () => {
    expect(
      stale(
        [
          "notemap-shell-300",
          "notemap-shell-100",
          "notemap-shell-200",
          "notemap-shares",
          "notemap-shell-400",
        ],
        "notemap-shell-400",
      ),
    ).toEqual(["notemap-shell-200", "notemap-shell-100"]);
  });

  it("is nothing where there is only the one before", () => {
    expect(
      stale(["notemap-shell-1", "notemap-shell-2"], "notemap-shell-2"),
    ).toEqual([]);
  });
});
