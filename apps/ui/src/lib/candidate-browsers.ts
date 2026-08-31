import type { Component } from "svelte";

import CandidateBrowser from "$components/routing/CandidateBrowser.svelte";

export type BrowserProps = {
  destination: string;
  capability: string;
  field: string;
  value: string;
  onchoose: (value: string) => void;
};

/**
 * Empty on purpose: the two kinds notemap has are converging rather than
 * diverging (destination-webdav.md), and a bespoke control pays off only
 * where kinds diverge. This is the seam, not a place to fill it in.
 */
const REGISTRY: Partial<Record<string, Component<BrowserProps>>> = {};

/** The schema-driven browser is what every kind that registers nothing draws through. */
export function browserFor(kind: string): Component<BrowserProps> {
  return REGISTRY[kind] ?? CandidateBrowser;
}
