import type { Component } from "svelte";

import CandidateBrowser from "$components/routing/CandidateBrowser.svelte";

export type BrowserProps = {
  destination: string;
  capability: string;
  field: string;
  value: string;
  onchoose: (value: string) => void;
};

export type BrowserRegistry = Partial<Record<string, Component<BrowserProps>>>;

/**
 * Empty on purpose: the two kinds notemap has are converging rather than
 * diverging (destination-webdav.md), and a bespoke control pays off only
 * where kinds diverge. This is the seam, not a place to fill it in.
 */
const REGISTRY: BrowserRegistry = {};

/**
 * The schema-driven browser is what every kind that registers nothing draws
 * through. `registry` is a parameter because the standing one is empty and a
 * lookup nothing can be registered in is a lookup no test can tell from a
 * constant.
 */
export function browserFor(
  kind: string,
  registry: BrowserRegistry = REGISTRY,
): Component<BrowserProps> {
  return registry[kind] ?? CandidateBrowser;
}
