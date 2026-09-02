import type { Component } from "svelte";

import CandidateBrowser from "$components/routing/CandidateBrowser.svelte";
import PathLine from "$components/routing/PathLine.svelte";

/**
 * A control for one askable field, and the whole of it — the text the field
 * holds is typed into the control rather than into an input beside it. Two
 * places holding one value is what the composer used to do, and neither could
 * see the other.
 */
export type BrowserProps = {
  destination: string;
  capability: string;
  field: string;
  /** What the field is called, for the label the control's own input carries. */
  label: string;
  value: string;
  onchange: (value: string) => void;
  /** Committing from inside the control, where its keys reach that far. */
  onsubmit?: () => void;
};

export type BrowserRegistry = Partial<Record<string, Component<BrowserProps>>>;

/**
 * The kinds that hold a filesystem draw the typed line; every other kind draws
 * the schema-driven browser, which knows nothing about paths. The lookup is on
 * the kind alone: what a field means is the kind's business, and a capability
 * a kind shares with another does not make their vaults the same shape.
 */
const REGISTRY: BrowserRegistry = {
  filesystem: PathLine,
  webdav: PathLine,
};

export function browserFor(
  kind: string,
  registry: BrowserRegistry = REGISTRY,
): Component<BrowserProps> {
  return registry[kind] ?? CandidateBrowser;
}
