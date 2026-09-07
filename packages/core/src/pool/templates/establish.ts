import type { PoolPorts, PoolTx } from "#types/api/ports";
import type { Timestamp } from "#types/domain/ids";
import type { RoutingRecord } from "#types/domain/routing";

/**
 * The first delivery from an `establish` template makes its folder; every one
 * after that expects to find it. Written in the transaction that stores the
 * delivered record, so a delivery that was abandoned leaves the template
 * unestablished — correct, since nothing landed.
 */
export async function established(
  ports: PoolPorts,
  tx: PoolTx,
  record: RoutingRecord,
  at: Timestamp,
): Promise<void> {
  const applied = record.applied;
  if (applied === undefined) return;

  const template = await tx.routingTemplate(applied.template);
  if (template === undefined) return;
  if (template.folder !== "establish") return;
  if (template.establishedAt !== undefined) return;

  const { modifiedAt: _modified, ...held } = template;
  await tx.updateRoutingTemplate({ ...held, establishedAt: at });
}
