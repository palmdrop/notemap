import type { Presence } from "@notemap/client";

/**
 * What withdrawing asks, given what the destination found. It says whether the
 * thing is there and never what is in it: a file still there may have been
 * emptied or rewritten since, and nothing read it to find out.
 */
export function askingToWithdraw(
  presence: Presence | undefined,
  kind: string | undefined,
  pointer: string | undefined,
): string {
  const block = kind === "arena";

  if (presence?.kind === "present") {
    if (block && presence.of > 1) {
      return `${String(presence.found)} of ${String(presence.of)} blocks are still there. Withdraw anyway?`;
    }
    return `${thing(block, pointer)} is still there. Withdraw anyway?`;
  }

  if (presence?.kind === "absent") {
    return `${thing(block, pointer)} is not there any more. Withdraw?`;
  }

  return "Withdraw?";
}

function thing(block: boolean, pointer: string | undefined): string {
  if (block) return "The block";
  const name = pointer
    ?.split("/")
    .filter((part) => part !== "")
    .at(-1);
  return name === undefined ? "The file" : `The file ${name}`;
}
