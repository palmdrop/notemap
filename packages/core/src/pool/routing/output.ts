import { ok, refused } from "#utils/result";
import type { PoolPorts } from "#types/api/ports";
import type { OutputRefusal } from "#types/api/refusal";
import type { RoutingRecordId } from "#types/domain/ids";
import type {
  DeliveredOutput,
  DeliveryLanding,
  OpenedOutput,
  StoredOutput,
} from "#types/domain/routing";
import type { Result } from "#types/result";

/**
 * The bytes have already arrived at the destination by the time this runs, so
 * failing to store the evidence must not fail the call that records it.
 */
export type Landed = {
  readonly landing: DeliveryLanding;
  /** Why the output was not kept. The delivery still landed. */
  readonly outputLost?: string;
};

/** Called outside every transaction: this reads a stream, and the store holds a write lock throughout one. */
export async function landingFor(
  ports: PoolPorts,
  delivered: {
    readonly pointer?: string;
    readonly url?: string;
    readonly output?: DeliveredOutput;
  },
  signal?: AbortSignal,
): Promise<Landed> {
  const where = {
    ...(delivered.pointer === undefined ? {} : { pointer: delivered.pointer }),
    ...(delivered.url === undefined ? {} : { url: delivered.url }),
  };

  let output: StoredOutput | undefined;
  try {
    output = await storeOutput(ports, delivered.output, signal);
  } catch (cause) {
    return {
      landing: where,
      outputLost: cause instanceof Error ? cause.message : String(cause),
    };
  }

  return { landing: { ...where, ...(output === undefined ? {} : { output }) } };
}

/**
 * Asked inside the transaction that records the landing: bytes already held
 * are reused rather than written, and a reclaim may have taken them since.
 * What is gone is lost evidence, as a write that failed is.
 */
export async function stillHeld(
  ports: PoolPorts,
  landed: Landed | undefined,
): Promise<Landed | undefined> {
  const content = landed?.landing.output?.content;
  if (landed === undefined || content === undefined) return landed;
  if ((await ports.blobs.open(content.blob)) !== undefined) return landed;

  const { output, ...where } = landed.landing;
  const note = output?.note;
  return {
    landing: { ...where, ...(note === undefined ? {} : { output: { note } }) },
    outputLost: `the output's blob ${content.blob} was reclaimed before it was recorded`,
  };
}

/** An output that is neither content nor note is nothing, and the record keeps nothing. */
async function storeOutput(
  ports: PoolPorts,
  output: DeliveredOutput | undefined,
  signal?: AbortSignal,
): Promise<StoredOutput | undefined> {
  if (output === undefined) return undefined;

  const { content, note } = output;
  const said = note === undefined ? {} : { note };

  if (content === undefined) {
    return note === undefined ? undefined : said;
  }

  const blob = await ports.blobs.put(await content.open(signal));
  return {
    content: { blob: blob.hash, mediaType: content.mediaType },
    ...said,
  };
}

/** Does not rehash, as an asset's own read does not: drift is `verify`'s to find. */
export async function openOutput(
  ports: PoolPorts,
  id: RoutingRecordId,
  signal?: AbortSignal,
): Promise<Result<OpenedOutput, OutputRefusal>> {
  const record = await ports.store.routingRecord(id);
  if (record === undefined) {
    return refused({ kind: "no-such-record", record: id });
  }

  const content = record.output?.content;
  // Ordinary rather than an error condition: most records carry no output.
  if (content === undefined) return refused({ kind: "no-output", record: id });

  const bytes = await ports.blobs.open(content.blob, signal);
  if (bytes === undefined) {
    return refused({ kind: "blob-missing", blob: content.blob });
  }

  return ok({ blob: content.blob, mediaType: content.mediaType, bytes });
}
