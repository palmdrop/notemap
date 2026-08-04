import type { EnrichmentName, SourceId } from "./ids";

export type SourceDescriptor = {
  readonly id: SourceId;
  readonly autoRequest: readonly EnrichmentName[];
};
