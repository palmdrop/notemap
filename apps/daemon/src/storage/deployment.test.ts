import { describe, expect, it } from "vitest";

import { deploymentOf, DEPLOYMENT_VARIABLE } from "./deployment";

const declaring = (value: string) => ({ [DEPLOYMENT_VARIABLE]: value });

describe("what a daemon says it is deployed as", () => {
  it("is what it was told, where it was told", () => {
    expect(deploymentOf(declaring("docker"), false)).toEqual({
      name: "docker",
      contained: false,
    });
  });

  it("is a container where only the marker says so", () => {
    expect(deploymentOf({}, true)).toEqual({
      name: "container",
      contained: true,
    });
  });

  it("prefers its own claim to the marker, since the marker says less", () => {
    expect(deploymentOf(declaring("docker"), true)).toEqual({
      name: "docker",
      contained: true,
    });
  });

  /**
   * A name is free text an image declares; the marker is the only part a daemon
   * can check. So an operator labelling a bare-metal daemon gets the label and
   * no claim about where its paths are.
   */
  it("holds a declared name without claiming containment for it", () => {
    expect(deploymentOf(declaring("nixos"), false)?.contained).toBe(false);
  });

  /** Absence proves nothing, so nothing is claimed. */
  it("says nothing where neither says so", () => {
    expect(deploymentOf({}, false)).toBeUndefined();
    expect(deploymentOf(declaring("  "), false)).toBeUndefined();
  });
});
