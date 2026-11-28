/** What a page posts its worker to learn which build the worker keeps. */
export const WHICH_BUILD = "notemap:which-build";

export type Keeps = { readonly keeps: string };

export function isKeeps(said: unknown): said is Keeps {
  return (
    typeof said === "object" &&
    said !== null &&
    typeof (said as Record<string, unknown>)["keeps"] === "string"
  );
}
