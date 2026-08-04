import type { EnrichmentDescriptor } from "../domain/enrichment";
import type { PayloadTypeDescriptor } from "../domain/payload";
import type { SourceDescriptor } from "../domain/source";
import type { RetryPolicy } from "../domain/work";

export type PoolConfig = {
  readonly sources: readonly SourceDescriptor[];
  readonly payloadTypes: readonly PayloadTypeDescriptor[];
  readonly enrichments: readonly EnrichmentDescriptor[];
  readonly retry: RetryPolicy;
};
