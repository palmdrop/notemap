import { address } from "./address.svelte";

/**
 * Stands in for `$app/navigation` where a surface moves by address: `goto`
 * moves the test's address, and so does a press on a link inside the app.
 * Mock it with `vi.mock("$app/navigation", () => import("$testing/router"))`
 * beside `$app/state`, and call `follow()` once per test file.
 */
export function goto(
  to: string | URL,
  options?: { state?: App.PageState },
): Promise<void> {
  const url = new URL(String(to), "http://localhost");
  address.path = `${url.pathname}${url.search}`;
  address.state = options?.state ?? {};
  return Promise.resolve();
}

export function replaceState(to: string | URL, state: App.PageState): void {
  if (String(to) !== "") void goto(to);
  address.state = state;
}

export function pushState(to: string | URL): void {
  void goto(to);
}

export function beforeNavigate(): void {}

export function afterNavigate(): void {}

/** Presses on links inside the page move the address, as the router would. */
export function follow(): void {
  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest("a");
    const href = link?.getAttribute("href");
    if (href === null || href === undefined || /^[a-z]+:/i.test(href)) return;
    event.preventDefault();
    void goto(href);
  });
}
