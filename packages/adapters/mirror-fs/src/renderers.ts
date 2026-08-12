import type { MirrorRecord, PayloadTypeName } from "@notemap/core";

import type { FrontmatterValue } from "./frontmatter";

export type Rendering = {
  /** Markdown, below the frontmatter the driver emits. */
  readonly body: string;
  /** Extra keys, which may not shadow the fixed ones. */
  readonly frontmatter?: ReadonlyMap<string, FrontmatterValue>;
};

/**
 * Where this rendering is about to be written. A renderer that points at
 * something outside the mirror — a blob, whose layout is the blob driver's —
 * needs somewhere to be relative to, and only the driver knows it.
 */
export type RenderingContext = {
  readonly directory: string;
};

/**
 * May be as lossy and opinionated as it likes: nothing ever parses what it
 * produces, and losslessness rides entirely on the record beside it.
 */
export type Renderer = (
  record: MirrorRecord,
  at: RenderingContext,
) => Rendering;

export type Renderers = Readonly<Partial<Record<PayloadTypeName, Renderer>>>;

/** What a payload type with no renderer gets. */
export const renderAsJson: Renderer = (record) => {
  const content = JSON.stringify(record.item.payload.content, undefined, 2);
  const fence = longestFence(content);

  return { body: [`${fence}json`, content, fence, ""].join("\n") };
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
