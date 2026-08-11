import type { MirrorRecord, PayloadTypeName } from "@notemap/core";

import type { FrontmatterValue } from "./frontmatter";

export type Rendering = {
  /** Markdown, below the frontmatter the driver emits. */
  readonly body: string;
  /** Extra keys, which may not shadow the fixed ones. */
  readonly frontmatter?: ReadonlyMap<string, FrontmatterValue>;
};

/**
 * A renderer may be as lossy, opinionated and pretty as it likes: nothing ever
 * parses what it produces, and losslessness rides entirely on the record beside
 * it. It may not throw quietly, though — a broken renderer fails the job.
 */
export type Renderer = (record: MirrorRecord) => Rendering;

export type Renderers = Readonly<Partial<Record<PayloadTypeName, Renderer>>>;

/**
 * What a payload type with no renderer gets. Readable enough to be worth having
 * — the frontmatter above it carries the provenance — and complete, because a
 * payload's content is open JSON and the driver knows no part of it is prose.
 */
export const renderAsJson: Renderer = (record) => ({
  body: [
    "```json",
    JSON.stringify(record.item.payload.content, undefined, 2),
    "```",
    "",
  ].join("\n"),
});
