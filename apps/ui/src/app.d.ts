// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    interface PageState {
      trail?: { readonly within: boolean; readonly steps: number };
      /** The item a decision just moved on from, which the next item's bar speaks of. */
      left?: string;
    }
    // interface Platform {}
  }

  /** Shipped in Chromium, and not yet in TypeScript's DOM library. */
  class CloseWatcher {
    constructor(options?: { signal?: AbortSignal });
    onclose: ((event: Event) => void) | null;
    destroy(): void;
  }
}

export {};
