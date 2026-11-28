import { File as NodeFile } from "node:buffer";

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { json } from "@notemap/client/testing";

import { pool } from "$testing/pool";
import { holding, posted } from "$testing/shares";
import { clearDraft, readDraft } from "$lib/draft";
import { holdShare, type Holding } from "$lib/sharing/held";
import CapturePage from "./+page.svelte";

const at = vi.hoisted(() => ({ url: "http://localhost/capture" }));
const replaced = vi.hoisted(() => ({ urls: [] as string[] }));
const went = vi.hoisted(() => ({ to: [] as string[] }));

vi.mock("$app/navigation", () => ({
  goto: (to: string) => went.to.push(to),
  replaceState: (url: string | URL) => replaced.urls.push(String(url)),
}));
vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));
vi.mock("$app/state", () => ({
  get page() {
    return { url: new URL(at.url), route: { id: "/capture" }, state: {} };
  },
}));

let shares: Holding;

beforeEach(() => {
  pool(() => json(200, { values: [] }));
  shares = holding();
  vi.stubGlobal("caches", { open: () => Promise.resolve(shares) });
});

afterEach(() => {
  at.url = "http://localhost/capture";
  replaced.urls = [];
  went.to = [];
  clearDraft();
  vi.unstubAllGlobals();
});

/** What the page says over its bar. */
const said = () =>
  screen.queryAllByRole("status").map((one) => one.textContent?.trim());

test("arrived from a share, adds it to the draft, says so, and puts the address back", async () => {
  at.url = "http://localhost/capture?shared";
  await holdShare(
    posted({ text: "from another app" }, [new NodeFile(["x"], "a.jpg")]),
    shares,
    "1",
  );

  render(CapturePage);

  await waitFor(() => {
    expect(said()).toContain("Added what was shared, at the end.");
  });
  expect(readDraft().text).toBe("from another app");
  expect(replaced.urls).toEqual(["http://localhost/capture"]);
});

test("arrived from a share that could not be held, says so", async () => {
  at.url = "http://localhost/capture?shared=failed";

  render(CapturePage);

  await waitFor(() => {
    expect(said()).toContain("Could not take what was shared.");
    expect(replaced.urls).toEqual(["http://localhost/capture"]);
  });
});

test("opened as ever, says nothing of shares where none are new", async () => {
  render(CapturePage);

  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(said().some((words) => /shared/.test(words ?? ""))).toBe(false);
});

test("signed out, says that what it takes is held until someone signs in", async () => {
  pool((request) =>
    new URL(request.url).pathname === "/v1/session"
      ? json(200, { authenticated: false, requiresCredentials: true })
      : json(200, { values: [] }),
  );

  render(CapturePage);

  await waitFor(() => {
    expect(said()).toContain(
      "Signed out. What you capture is held until someone signs in.",
    );
  });
});

test("signed out, stays on the page after a capture, ready for the next", async () => {
  pool((request) => {
    const path = new URL(request.url).pathname;
    if (path === "/v1/session") {
      return json(200, { authenticated: false, requiresCredentials: true });
    }
    return path === "/v1/captures"
      ? json(401, { error: { code: "unauthenticated" } })
      : json(200, { values: [] });
  });
  render(CapturePage);
  await waitFor(() => {
    expect(said()).toContain(
      "Signed out. What you capture is held until someone signs in.",
    );
  });

  const written = screen.getByLabelText(
    "What to capture",
  ) as HTMLTextAreaElement;
  await fireEvent.input(written, { target: { value: "a note for later" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(written.value).toBe("");
  });
  expect(went.to).toEqual([]);
});

test("signed in, goes to the queue after a capture", async () => {
  pool(() => json(200, { values: [] }));
  render(CapturePage);

  const written = screen.getByLabelText(
    "What to capture",
  ) as HTMLTextAreaElement;
  await fireEvent.input(written, { target: { value: "a note" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(went.to).toEqual(["/"]);
  });
});
