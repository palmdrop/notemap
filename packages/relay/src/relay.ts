import { assetIdFor, place } from "./assets";
import { poolAt } from "#pool/pool";
import type { Landed, Relay, RelayOptions, Relayed } from "./types";

const NOTE = "note";

export function createRelay(options: RelayOptions): Relay {
  const pool = poolAt(options.pool);

  return {
    assetIdFor: (attachment) => assetIdFor(options.namespace, attachment),

    async relay(one: Relayed, signal?: AbortSignal): Promise<Landed> {
      const payload = {
        type: NOTE,
        content: one.text === undefined ? {} : { text: one.text },
        metadata: {},
        assets: await place(pool, options.namespace, one.attachments, signal),
      };

      // No `id`: a passive source that is re-read rather than replayed supplies
      // its own `sourceItemId` and lets the pool mint the item's.
      const captured = await pool.capture(
        {
          source: options.source,
          sourceItemId: one.sourceItemId,
          capturedAt: one.capturedAt,
          payload,
          tags: one.tags,
        },
        signal,
      );

      if (captured.kind !== "changed") {
        return { kind: captured.kind, item: captured.item.id };
      }

      // The identity is held by an item saying something else, which is what an
      // upstream edit looks like from here. The edit goes under an identity of
      // its own, so the pool matches this same call on replay and answers the
      // revision it already made instead of appending a second one.
      const edited = await pool.edit(
        captured.existing,
        {
          source: options.source,
          sourceItemId: `${one.sourceItemId}@${one.version}`,
          payload,
        },
        signal,
      );

      return edited.kind === "amended"
        ? { kind: "amended", item: edited.item.id }
        : { kind: "revised", item: edited.revision.id };
    },
  };
}
