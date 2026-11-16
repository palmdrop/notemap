import type {
  Destination,
  DestinationDescription,
  DestinationProbe,
} from "@notemap/client";

/**
 * Where a destination stands, in one word and the destination's own reason:
 * available, unavailable (a check that failed), unusable (a kind the pool no
 * longer has, or one that cannot describe itself), disabled, or being checked.
 */
export type Standing = {
  readonly word:
    | "available"
    | "unavailable"
    | "unusable"
    | "disabled"
    | "checking"
    | "not checked";
  readonly why?: string;
};

export function standingOf(
  one: Destination,
  described: DestinationDescription | undefined,
  probed: DestinationProbe | undefined,
  asking: boolean,
): Standing {
  if (one.retired === true) return { word: "disabled" };
  if (described !== undefined && described.kind !== "described") {
    return { word: "unusable", why: described.detail };
  }
  if (probed !== undefined && probed.kind !== "not-offered") {
    if (probed.kind === "ready") return { word: "available" };
    return { word: "unavailable", why: probed.detail };
  }
  if (asking) return { word: "checking" };
  if (described?.kind === "described") return { word: "available" };
  return { word: "not checked" };
}

export function alarming(standing: Standing): boolean {
  return standing.word === "unavailable" || standing.word === "unusable";
}
