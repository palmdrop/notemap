import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WHICH_BUILD } from "$lib/worker/kept";

const served = vi.hoisted(() => ({ current: false }));

vi.mock("$app/environment", () => ({ version: "this build" }));

vi.mock("$app/state", () => ({
  updated: {
    get current() {
      return served.current;
    },
    check: () => Promise.resolve(served.current),
  },
}));

/** The browser's worker container, its worker keeping a build, or none drawing the page. */
function workers(keeps: string | undefined) {
  const container = Object.assign(new EventTarget(), {
    controller: null as { postMessage(said: unknown): void } | null,
    startMessages: () => undefined,
  });
  const keeping = (build: string) => ({
    postMessage(said: unknown) {
      if (said !== WHICH_BUILD) return;
      container.dispatchEvent(
        new MessageEvent("message", { data: { keeps: build } }),
      );
    },
  });
  if (keeps !== undefined) container.controller = keeping(keeps);
  vi.stubGlobal("navigator", { serviceWorker: container });
  return {
    takenOverBy(build: string) {
      container.controller = keeping(build);
      container.dispatchEvent(new Event("controllerchange"));
    },
  };
}

let stop: () => void = () => undefined;

beforeEach(() => {
  served.current = false;
  vi.resetModules();
});

afterEach(() => {
  stop();
  vi.unstubAllGlobals();
});

async function watching() {
  const module = await import("./newer.svelte");
  stop = module.watchWorker();
  return module.newer;
}

describe("a newer build, for a page the worker draws", () => {
  it("is not one while the daemon serves it and the worker does not keep it yet", async () => {
    workers("this build");
    const newer = await watching();

    served.current = true;

    expect(newer.current).toBe(false);
  });

  it("is one once a worker keeping it takes over", async () => {
    const browser = workers("this build");
    const newer = await watching();

    browser.takenOverBy("the next build");

    expect(newer.current).toBe(true);
  });

  it("is one where the worker took over before the page asked", async () => {
    workers("the next build");
    const newer = await watching();

    expect(newer.current).toBe(true);
  });
});

describe("a newer build, for a page no worker draws", () => {
  it("is one as soon as the daemon serves it", async () => {
    workers(undefined);
    const newer = await watching();

    served.current = true;

    expect(newer.current).toBe(true);
  });

  it("is not one where a worker first takes the page, keeping this build", async () => {
    const browser = workers(undefined);
    const newer = await watching();

    browser.takenOverBy("this build");

    expect(newer.current).toBe(false);
  });
});
