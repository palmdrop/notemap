import { wide } from "./breakpoint";
import { modality } from "./modality.svelte";

/**
 * Whether something just done may put the caret in a line: not a tap on a
 * phone, where the caret raises the keyboard over what was tapped.
 */
export function caretFollows(): boolean {
  return modality.keys || wide();
}
