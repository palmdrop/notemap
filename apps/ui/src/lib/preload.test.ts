import { expect, test, vi } from "vitest";

const preloaded = vi.hoisted(() => [] as string[]);

vi.mock("$app/navigation", () => ({
  preloadCode: (path: string) => {
    preloaded.push(path);
    return Promise.resolve();
  },
}));

import { preloadSurfaces } from "./preload";

test("fetches every surface's code once the page is idle", async () => {
  preloadSurfaces();
  expect(preloaded).toEqual([]);

  await vi.waitFor(() => {
    expect(preloaded).toContain("/feed");
  });
  expect(preloaded).toEqual(
    expect.arrayContaining(["/", "/capture", "/log", "/items/*/process"]),
  );
});
