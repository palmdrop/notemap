import type { DestinationAdapter } from "../types/api/ports";
import type { JsonSchema } from "../types/json";
import type {
  CapabilityName,
  DestinationId,
  PayloadTypeName,
} from "../types/domain/ids";
import type {
  Capability,
  Delivery,
  DeliveryOutcome,
  DestinationDescriptor,
} from "../types/domain/routing";

/**
 * A destination that fails on command. A real filesystem is never unreachable
 * and rarely refuses, so it would exercise one of the three outcomes delivery
 * exists to get right; this exercises all of them.
 */

export type ScriptedAnswer = DeliveryOutcome | { readonly kind: "hang" };

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
  /** Oldest first, and live: it grows as more is handed over. */
  readonly received: readonly Received[];
  answers(next: ScriptedAnswer): void;
  /** Takes precedence over the standing answer, for one delivery. */
  answersOnce(next: ScriptedAnswer): void;
};

export type FakeDestinationOptions = {
  readonly id?: DestinationId;
  readonly capabilities?: readonly Capability[];
  /** Whether it reads the assets it is handed, which is what proves the opener lazy. */
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

      // A host that never came back: the signal is the only way out, and a
      // signal already aborted fires no event to wait for.
      return new Promise<DeliveryOutcome>((_resolve, reject) => {
        const giveUp = () =>
          reject(new Error("the destination was still thinking"));

        if (signal === undefined) return;
        if (signal.aborted) return giveUp();
        signal.addEventListener("abort", giveUp, { once: true });
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
