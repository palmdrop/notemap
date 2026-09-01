import type { Delivery, PayloadTypeName } from "@notemap/core";

import type { FrontmatterValue } from "./frontmatter";

export type Rendering = {
  /** CommonMark, below the frontmatter the adapter emits. */
  readonly body: string;
  /** Extra keys, which may not shadow the fixed ones. */
  readonly frontmatter?: ReadonlyMap<string, FrontmatterValue>;
};

/** Assets are keyed by slot, because a name may have been suffixed to avoid one already there. */
export type RenderingContext = {
  readonly directory: string;
  readonly assets: ReadonlyMap<string, string>;
};

/** A destination's own dialect: nothing at the far end parses it, so it may be as lossy as the vault wants. */
export type Renderer = (delivery: Delivery, at: RenderingContext) => Rendering;

export type Renderers = Readonly<Partial<Record<PayloadTypeName, Renderer>>>;

/** Anything that ends a bare CommonMark link destination early, or is not allowed in one. */
const NEEDS_BRACKETS = /[\s()<>\\]/;

/**
 * A link to a file this adapter wrote. An asset keeps the name it was uploaded
 * with, and a space or a parenthesis in one ends a bare destination early — so
 * a name that carries either goes in the angle-bracket form instead.
 */
export function linkTo(name: string): string {
  return NEEDS_BRACKETS.test(name)
    ? `<${name.replace(/[<>\\]/g, (each) => `\\${each}`)}>`
    : name;
}

/** What a payload type with no renderer gets. */
export const renderAsJson: Renderer = (delivery, at) => {
  const content = JSON.stringify(delivery.payload.content, undefined, 2);
  const fence = longestFence(content);

  const links = [...at.assets.values()].map(
    (name) => `- [${name}](${linkTo(name)})`,
  );
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
