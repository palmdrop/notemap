import type { SweepPolicy } from "../domain/asset";
import type { EnrichmentDescriptor } from "../domain/enrichment";
import type { PayloadTypeDescriptor } from "../domain/payload";
import type { SourceDescriptor } from "../domain/source";
import type { RetryPolicy } from "../domain/work";

export type PoolConfig = {
  readonly sources: readonly SourceDescriptor[];
  readonly payloadTypes: readonly PayloadTypeDescriptor[];
  readonly enrichments: readonly EnrichmentDescriptor[];
  readonly retry: RetryPolicy;
  readonly sweep: SweepPolicy;
  /**
   * An IANA zone name, for reading the date of a capture that carries no offset
   * of its own. The host's, never core's to invent, and never a silent UTC: a
   * capture from a source is filed on the day the person running the pool is
   * living in.
   */
  readonly zone: string;
};
