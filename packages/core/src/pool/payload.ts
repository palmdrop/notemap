import type { SchemaIssue } from "#types/json";
import type { PoolConfig } from "#types/api/config";
import type { PoolPorts, PoolTx } from "#types/api/ports";
import type { AssetId, PayloadTypeName } from "#types/domain/ids";
import type { Payload } from "#types/domain/payload";

export type PayloadRefusal =
  | { readonly kind: "unknown-payload-type"; readonly type: PayloadTypeName }
  | {
      readonly kind: "payload-invalid";
      readonly issues: readonly SchemaIssue[];
    };

/** Everything wrong with a payload that is decidable without reading the pool. */
export function checkPayload(
  config: PoolConfig,
  ports: PoolPorts,
  payload: Payload,
): PayloadRefusal | undefined {
  const type = config.payloadTypes.find((known) => known.name === payload.type);
  if (type === undefined) {
    return { kind: "unknown-payload-type", type: payload.type };
  }

  const issues = ports.schemas.validate(type.contentSchema, payload.content);
  if (issues.length > 0) return { kind: "payload-invalid", issues };

  return undefined;
}

/**
 * A read inside the transaction, like every other precondition: an asset swept
 * between the check and the write would otherwise leave a reference to bytes
 * that have gone.
 */
export async function checkAssets(
  tx: PoolTx,
  payload: Payload,
): Promise<
  { readonly kind: "unknown-asset"; readonly asset: AssetId } | undefined
> {
  for (const ref of payload.assets) {
    if ((await tx.asset(ref.asset)) === undefined) {
      return { kind: "unknown-asset", asset: ref.asset };
    }
  }

  return undefined;
}

/** Asset order carries no meaning, so neither side of a comparison differs by it. */
export function canonicalPayload(payload: Payload): Payload {
  return {
    ...payload,
    assets: [...payload.assets].sort((a, b) =>
      a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0,
    ),
  };
}
