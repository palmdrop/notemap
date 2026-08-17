import type { Delivery, PayloadTypeName } from "@notemap/core";

import type { FrontmatterValue } from "./frontmatter";

export type Rendering = {
  /** CommonMark, below the frontmatter the adapter emits. */
  readonly body: string;
  /** Extra keys, which may not shadow the fixed ones. */
  readonly frontmatter?: ReadonlyMap<string, FrontmatterValue>;
};

/**
 * Where this note is about to be written, and what its assets ended up being
 * called beside it — keyed by slot, because a name may have been suffixed to
 * avoid taking a file that was already there.
 */
export type RenderingContext = {
  readonly directory: string;
  readonly assets: ReadonlyMap<string, string>;
};

/**
 * A destination's own dialect. Nothing at the far end parses what this
 * produces, so it may be as lossy and opinionated as the vault it writes for.
 */
export type Renderer = (delivery: Delivery, at: RenderingContext) => Rendering;

export type Renderers = Readonly<Partial<Record<PayloadTypeName, Renderer>>>;

/** What a payload type with no renderer gets. */
export const renderAsJson: Renderer = (delivery, at) => {
  const content = JSON.stringify(delivery.payload.content, undefined, 2);
  const fence = longestFence(content);

  const links = [...at.assets.values()].map((name) => `- [${name}](${name})`);
  const lines = [`${fence}json`, content, fence, ""];

  return {
    body: [...lines, ...(links.length > 0 ? [...links, ""] : [])].join("\n"),
  };
};

/**
 * A fence long enough to survive its own content. A payload's content is open
 * JSON that may hold a backtick run of any length, and a fence that content
 * closes early turns the rest of the file into prose.
 */
function longestFence(content: string): string {
  const runs = content.match(/`+/g) ?? [];
  const longest = runs.reduce((most, run) => Math.max(most, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}
