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
}

export {};
