import type { Delivery, DeliveredOutput } from "@notemap/core";

import { FIXED_KEYS, fixedFrontmatter, toYaml } from "./frontmatter";
import type { FrontmatterValue } from "./frontmatter";
import {
  renderAsJson,
  type Renderers,
  type Rendering,
  type RenderingContext,
} from "./renderers";

/** What a renderer did rather than what a destination did, which is never worth retrying. */
export class RenderingFailed extends Error {}

export type Note = {
  /** The YAML block, ending in a newline. */
  readonly frontmatter: string;
  /** CommonMark, and on its own what an append carries. */
  readonly body: string;
};

/** What every note either kind writes is, and what a delivery says its output was. */
export const MARKDOWN = "text/markdown";

/** For a kind with nothing to confess: this rendering carries everything, and the assets go beside it. */
export function markdownOutput(text: string): DeliveredOutput {
  const written = new TextEncoder().encode(text);
  return {
    content: {
      mediaType: MARKDOWN,
      open: () => Promise.resolve(once(written)),
    },
  };
}

async function* once(written: Uint8Array): AsyncGenerator<Uint8Array> {
  yield written;
}

/**
 * One delivery as a note, wherever the note is going. A renderer may add
 * frontmatter of its own and may not shadow a fixed key, which is what keeps a
 * destination's dialect from rewriting the provenance a note is traced by.
 */
export function renderNote(
  renderers: Renderers,
  delivery: Delivery,
  at: RenderingContext,
): Note {
  const rendered = renderOrRefuse(renderers, delivery, at);

  const entries = new Map<string, FrontmatterValue>(fixedFrontmatter(delivery));
  for (const [key, value] of rendered.frontmatter ?? []) {
    if (!FIXED_KEYS.includes(key)) entries.set(key, value);
  }

  return { frontmatter: toYaml(entries), body: rendered.body };
}

function renderOrRefuse(
  renderers: Renderers,
  delivery: Delivery,
  at: RenderingContext,
): Rendering {
  const renderer = renderers[delivery.payload.type] ?? renderAsJson;
  try {
    return renderer(delivery, at);
  } catch (cause) {
    // It will throw identically on every attempt, so retrying is pointless.
    throw new RenderingFailed(
      `the renderer for ${delivery.payload.type} threw: ${why(cause)}`,
    );
  }
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
