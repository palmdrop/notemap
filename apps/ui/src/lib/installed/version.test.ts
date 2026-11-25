import { afterEach, describe, expect, it, vi } from "vitest";

import { holdFiles } from "$lib/draft";
import { opened } from "$lib/leaving.svelte";
import { notices } from "$lib/notices.svelte";

import { loadInstead, reload } from "./version";

vi.mock("$app/state", () => ({
  updated: { current: false, check: () => Promise.resolve(false) },
}));

const to = { url: new URL("http://localhost/feed") };
const moving = { willUnload: false, to };

/** An edit left open with changes, until the returned function closes it. */
function changed(): () => void {
  return opened({
    about: "a capture",
    changed: () => true,
    save: () => Promise.resolve(true),
    revert: () => undefined,
    resume: () => undefined,
  });
}

afterEach(() => {
  holdFiles([]);
  notices.clear();
  vi.unstubAllGlobals();
});

describe("a move within the app, once a newer build is served", () => {
  it("loads the page it was going to", () => {
    expect(loadInstead(true, moving)).toBe(to.url);
  });

  it("moves within the app as ever where nothing newer is served", () => {
    expect(loadInstead(false, moving)).toBeUndefined();
  });

  it("is left alone where the page is going anyway", () => {
    expect(loadInstead(true, { willUnload: true, to })).toBeUndefined();
    expect(loadInstead(true, { willUnload: false, to: null })).toBeUndefined();
  });

  it("waits while an edit has changes", () => {
    const close = changed();
    expect(loadInstead(true, moving)).toBeUndefined();
    close();
    expect(loadInstead(true, moving)).toBe(to.url);
  });

  it("waits while attachments are held that were not captured", () => {
    holdFiles([new File(["x"], "photo.jpg")]);
    expect(loadInstead(true, moving)).toBeUndefined();
  });
});

describe("reloading for a newer build", () => {
  it("reloads at once where nothing would be lost", () => {
    const reloaded = vi.fn();
    vi.stubGlobal("location", { reload: reloaded });

    reload();

    expect(reloaded).toHaveBeenCalledOnce();
  });

  it("waits, and says why, while attachments are held that were not captured", () => {
    const reloaded = vi.fn();
    vi.stubGlobal("location", { reload: reloaded });
    holdFiles([new File(["x"], "photo.jpg")]);

    reload();

    expect(reloaded).not.toHaveBeenCalled();
    expect(notices.shown.at(-1)?.what).toMatch(/waits for the attachments/);
  });

  it("asks first where an edit has changes", () => {
    const reloaded = vi.fn();
    vi.stubGlobal("location", { reload: reloaded });
    const close = changed();

    reload();

    expect(reloaded).not.toHaveBeenCalled();
    close();
  });
});
