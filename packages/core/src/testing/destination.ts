import type { Destinations } from "#types/api/ports";
import type { JsonObject, JsonSchema } from "#types/json";
import type {
  CandidatesAnswer,
  Capability,
  Destination,
  DestinationKind,
} from "#types/domain/destination";
import type {
  CapabilityName,
  DestinationId,
  DestinationKindName,
  PayloadTypeName,
  Timestamp,
} from "#types/domain/ids";
import type { Delivery, DeliveryOutcome } from "#types/domain/routing";

/**
 * A kind registry that fails on command. A real filesystem is never unreachable
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
  readonly destination: Destination;
  readonly delivery: Delivery;
  /** Read only where the registry was told to want bytes. */
  readonly assets: readonly ReceivedAsset[];
};

export type FakeDestinations = Destinations & {
  /** Oldest first, and live: it grows as more is handed over. */
  readonly received: readonly Received[];
  answers(next: ScriptedAnswer): void;
  /** Takes precedence over the standing answer, for one delivery. */
  answersOnce(next: ScriptedAnswer): void;
  /**
   * What `describe` throws with. A bare string is an undescribable
   * destination; an `Error` instance — `Unusable`, say — is thrown as itself,
   * for a test that needs `describe` to reject with a particular kind of
   * failure.
   */
  cannotDescribe(detail: string | Error | undefined): void;
  /** What `candidates` answers when nothing says it should fail. */
  answersCandidates(next: CandidatesAnswer): void;
  /** What `candidates` throws with, on the same terms as `cannotDescribe`. */
  cannotAnswerCandidates(detail: string | Error | undefined): void;
  /** What `probe` throws with. Undefined is a destination that is there. */
  cannotBeProbed(detail: string | Error | undefined): void;
};

export type FakeDestinationsOptions = {
  readonly kinds?: readonly DestinationKind[];
  readonly capabilities?: readonly Capability[];
  /** Whether it reads the assets it is handed, which is what proves the opener lazy. */
  readonly reads?: boolean;
  readonly answer?: ScriptedAnswer;
  readonly candidatesAnswer?: CandidatesAnswer;
};

const ANY_ARGUMENTS: JsonSchema = { type: "object" };

export const FAKE_KIND = "fake" as DestinationKindName;

/** Anything at all, so a test that is not about settings never has to supply any. */
export const ANY_SETTINGS: JsonSchema = { type: "object" };

export function fakeKind(
  overrides: { name?: string; settingsSchema?: JsonSchema } = {},
): DestinationKind {
  return {
    name: (overrides.name ?? FAKE_KIND) as DestinationKindName,
    settingsSchema: overrides.settingsSchema ?? ANY_SETTINGS,
  };
}

export function fakeCapability(
  overrides: {
    name?: string;
    accepts?: readonly string[];
    argumentsSchema?: JsonSchema;
  } = {},
): Capability {
  return {
    name: (overrides.name ?? "create-note") as CapabilityName,
    accepts: (overrides.accepts ?? ["text"]).map(
      (type) => type as PayloadTypeName,
    ),
    argumentsSchema: overrides.argumentsSchema ?? ANY_ARGUMENTS,
  };
}

export function fakeDestinationRow(
  overrides: {
    id?: string;
    name?: string;
    kind?: string;
    settings?: JsonObject;
    retiredAt?: string;
    at?: string;
  } = {},
): Destination {
  const at = (overrides.at ?? "2026-08-17T09:00:00.000Z") as Timestamp;

  return {
    id: (overrides.id ?? "vault") as DestinationId,
    name: overrides.name ?? "Vault",
    kind: (overrides.kind ?? FAKE_KIND) as DestinationKindName,
    settings: overrides.settings ?? {},
    ...(overrides.retiredAt === undefined
      ? {}
      : { retiredAt: overrides.retiredAt as Timestamp }),
    createdAt: at,
    modifiedAt: at,
  };
}

export function fakeDestinations(
  options: FakeDestinationsOptions = {},
): FakeDestinations {
  const kinds = options.kinds ?? [fakeKind()];
  const capabilities = options.capabilities ?? [fakeCapability()];

  const received: Received[] = [];
  const once: ScriptedAnswer[] = [];
  let standing: ScriptedAnswer = options.answer ?? {
    kind: "delivered",
    pointer: "somewhere",
  };
  let undescribable: string | Error | undefined;
  let candidatesAnswer: CandidatesAnswer = options.candidatesAnswer ?? {
    entries: [],
    truncated: false,
  };
  let cannotAnswer: string | Error | undefined;
  let cannotProbe: string | Error | undefined;

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
    kinds: () => kinds,

    describe: () =>
      undescribable === undefined
        ? Promise.resolve({ capabilities })
        : Promise.reject(
            undescribable instanceof Error
              ? undescribable
              : new Error(undescribable),
          ),

    deliver: async (destination, delivery, signal) => {
      const answer = once.shift() ?? standing;
      received.push({
        destination,
        delivery,
        assets: await read(delivery, signal),
      });

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

    candidates: () =>
      cannotAnswer === undefined
        ? Promise.resolve(candidatesAnswer)
        : Promise.reject(
            cannotAnswer instanceof Error
              ? cannotAnswer
              : new Error(cannotAnswer),
          ),

    probe: () =>
      cannotProbe === undefined
        ? Promise.resolve()
        : Promise.reject(
            cannotProbe instanceof Error ? cannotProbe : new Error(cannotProbe),
          ),

    received,
    answers: (next) => {
      standing = next;
    },
    answersOnce: (next) => {
      once.push(next);
    },
    cannotDescribe: (detail) => {
      undescribable = detail;
    },
    answersCandidates: (next) => {
      candidatesAnswer = next;
    },
    cannotAnswerCandidates: (detail) => {
      cannotAnswer = detail;
    },
    cannotBeProbed: (detail) => {
      cannotProbe = detail;
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
