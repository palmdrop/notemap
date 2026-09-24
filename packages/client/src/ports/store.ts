import type {
  AssetId,
  Destination,
  Item,
  ItemId,
  PoolIdentity,
  PoolSetting,
  RoutingTemplate,
  TagUse,
} from "#api/types";
import type { OperationId, PendingOperation } from "#outbox/operations";

/**
 * Where the outbox and the cache live. Every method is asynchronous even though
 * the in-memory pair answers instantly, so that a durable adapter — browser
 * storage, a file, a database — is a drop-in rather than a rewrite.
 */
export interface ClientStore {
  readOutbox(): Promise<readonly PendingOperation[]>;
  writeOperation(operation: PendingOperation): Promise<void>;
  removeOperation(id: OperationId): Promise<void>;
  /**
   * Takes an operation up for sending, and answers it as now written —
   * `sending` until `until` — or nothing where it is gone, or another
   * process's lease on it has not lapsed by `now`. Where two processes ask at
   * once, one is answered.
   */
  leaseOperation(
    id: OperationId,
    now: string,
    until: string,
  ): Promise<PendingOperation | undefined>;

  readItems(): Promise<readonly Item[]>;
  writeItems(items: readonly Item[]): Promise<void>;
  removeItems(ids: readonly ItemId[]): Promise<void>;

  /** The read caches, each a whole list replaced as the pool answers it. */
  readTags(): Promise<readonly TagUse[]>;
  writeTags(tags: readonly TagUse[]): Promise<void>;
  readDestinations(): Promise<readonly Destination[]>;
  writeDestinations(destinations: readonly Destination[]): Promise<void>;
  readTemplates(): Promise<readonly RoutingTemplate[]>;
  writeTemplates(templates: readonly RoutingTemplate[]): Promise<void>;
  /** Absent is "not yet read", never guessed from a default: a cold client has no answer here. */
  readPoolSettings(): Promise<readonly PoolSetting[] | undefined>;
  /** Absent clears it back to "not yet read" — what a dropped cache is written as. */
  writePoolSettings(
    settings: readonly PoolSetting[] | undefined,
  ): Promise<void>;

  /** Which pool everything above describes, absent until one has answered. */
  readPoolIdentity(): Promise<PoolIdentity | undefined>;
  writePoolIdentity(identity: PoolIdentity): Promise<void>;

  /**
   * A `File` rather than the bytes alone: the upload carries the filename and
   * the media type as headers, and neither is recoverable from bytes.
   */
  readBlob(asset: AssetId): Promise<File | undefined>;
  writeBlob(asset: AssetId, blob: File): Promise<void>;
  removeBlob(asset: AssetId): Promise<void>;
  /**
   * Where a shell's own renderer reaches bytes the store holds, for a capture
   * that has not landed. The adapter owns the URL and its revocation: a browser
   * answers with an object URL, and a shell that is not one answers differently.
   */
  blobUrl(asset: AssetId): Promise<string | undefined>;
}
