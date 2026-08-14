import type { DestinationAdapter } from "../types/api/ports";
import type { JsonSchema } from "../types/json";
import type {
  CapabilityName,
  DestinationId,
  PayloadTypeName,
  Timestamp,
} from "../types/domain/ids";
import type {
  Capability,
  Delivery,
  DeliveryOutcome,
  DestinationDescriptor,
} from "../types/domain/routing";

/**
 * A destination that fails on command.
 *
 * The three outcomes delivery exists to get right are `unreachable`, `rejected`
 * and a host that dies mid-attempt. A real filesystem is never unreachable and
 * rarely refuses, so it would exercise one of the three; this exercises all of
 * them, and records what it was handed so a test can assert that an adapter
 * receives every asset whole without reaching into any store.
 */

/** What the destination does with the next delivery it is handed. */
export type ScriptedAnswer = DeliveryOutcome | { readonly kind: "hang" };

/** One asset as it arrived: the name it was uploaded under, and its bytes. */
export type ReceivedAsset = {
  readonly slot: string;
  readonly filename: string;
  readonly bytes: Uint8Array;
};

export type Received = {
  readonly delivery: Delivery;
  /** Read only where the destination was told to want bytes. */
  readonly assets: readonly ReceivedAsset[];
};

export type FakeDestination = DestinationAdapter & {
  /** Everything it has been handed, oldest first. The array is live. */
  readonly received: readonly Received[];
  /** What it answers from here on. */
  answers(next: ScriptedAnswer): void;
  /** What it answers to the next delivery only, ahead of the standing answer. */
  answersOnce(next: ScriptedAnswer): void;
};

export type FakeDestinationOptions = {
  readonly id?: DestinationId;
  readonly capabilities?: readonly Capability[];
  /**
   * Whether it reads the assets it is handed. A capability that wants no bytes
   * opens no stream, which is the property the lazy opener exists for.
   */
  readonly reads?: boolean;
  readonly answer?: ScriptedAnswer;
};

const ANY_TARGET: JsonSchema = { type: "object" };

export function fakeCapability(
  overrides: {
    name?: string;
    accepts?: readonly string[];
    targetSchema?: JsonSchema;
  } = {},
): Capability {
  return {
    name: (overrides.name ?? "create-note") as CapabilityName,
    accepts: (overrides.accepts ?? ["text"]).map(
      (type) => type as PayloadTypeName,
    ),
    targetSchema: overrides.targetSchema ?? ANY_TARGET,
  };
}

export function fakeDestination(
  options: FakeDestinationOptions = {},
): FakeDestination {
  const descriptor: DestinationDescriptor = {
    id: (options.id ?? "vault") as DestinationId,
    capabilities: options.capabilities ?? [fakeCapability()],
  };

  const received: Received[] = [];
  const once: ScriptedAnswer[] = [];
  let standing: ScriptedAnswer = options.answer ?? {
    kind: "delivered",
    at: "2026-01-01T00:00:00.000Z" as Timestamp,
    pointer: "somewhere",
  };

  async function read(
    delivery: Delivery,
    signal?: AbortSignal,
  ): Promise<ReceivedAsset[]> {
    if (options.reads !== true) return [];

    const assets: ReceivedAsset[] = [];
    for (const each of delivery.assets) {
      assets.push({
        slot: each.slot,
        filename: each.asset.filename,
        bytes: await drain(await each.open(signal)),
      });
    }
    return assets;
  }

  return {
    describe: () => descriptor,

    deliver: async (delivery, signal) => {
      const answer = once.shift() ?? standing;
      received.push({ delivery, assets: await read(delivery, signal) });

      if (answer.kind !== "hang") return answer;

      // A host that never came back. The signal is the only way out, which is
      // what a caller bounding the attempt would use.
      return new Promise<DeliveryOutcome>((_resolve, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new Error("the destination was still thinking")),
        );
      });
    },

    received,
    answers: (next) => {
      standing = next;
    },
    answersOnce: (next) => {
      once.push(next);
    },
  };
}

async function drain(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    chunks.push(chunk);
    size += chunk.byteLength;
  }

  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}
