import { recordAction } from "../actions";
import { checkFor } from "../routing/prepare";
import { requestFor } from "./apply";
import type { PoolConfig } from "#types/api/config";
import type { PoolPorts, PoolTx } from "#types/api/ports";
import type {
  JobId,
  RoutingRecordId,
  TagName,
  Timestamp,
} from "#types/domain/ids";
import type { Item } from "#types/domain/item";
import type { RoutingRecord } from "#types/domain/routing";
import type { RoutingTemplate } from "#types/domain/template";
import { later } from "#utils/time";

/**
 * What a trigger tag arriving on an item comes to. Everything is decided before
 * the transaction opens, because deciding it means asking the destination what
 * it can do, and core performs no I/O inside one. The tag and the reservation
 * then commit together, so *tagged but not reserved* cannot exist and nothing
 * has to sweep for it.
 */
export type Firing =
  | { readonly kind: "fires"; readonly record: RoutingRecord }
  | { readonly kind: "refused"; readonly detail: string };

/**
 * A fired template **never attempts inline**: the delivery is an ordinary job
 * due a window later, which is what makes the corner's cancel real against a
 * vault that is mounted.
 *
 * The route is still prepared, which costs nothing — no destination kind goes
 * and looks to describe itself — and it is what tells a stale template from a
 * sleeping one. A destination that cannot be *reached* is not refused here: it
 * is unknowable until the delivery runs, and the reservation is what waits.
 */
export async function firingFor(
  config: PoolConfig,
  ports: PoolPorts,
  item: Item,
  template: RoutingTemplate,
  signal?: AbortSignal,
): Promise<Firing> {
  const request = requestFor(config, item, template);
  const checked = await checkFor(ports, item, request, signal);

  if (checked.kind === "refused" && checked.refusal.kind !== "unreachable") {
    return { kind: "refused", detail: said(checked.refusal) };
  }

  return {
    kind: "fires",
    record: {
      id: ports.ids.next<RoutingRecordId>(),
      item: item.id,
      target: {
        kind: "destination",
        destination: request.destination,
        capability: request.capability,
        arguments: request.arguments,
      },
      state: "pending",
      at: ports.clock.now(),
      applied: { template: template.id, firedByTag: true },
    },
  };
}

/** The reservation, the job that will carry it out, and the entry saying which template. */
export async function fire(
  config: PoolConfig,
  ports: PoolPorts,
  tx: PoolTx,
  record: RoutingRecord,
  tag: TagName,
  template: RoutingTemplate,
): Promise<void> {
  await tx.insertRoutingRecord(record);
  await tx.enqueue([
    {
      id: ports.ids.next<JobId>(),
      kind: "delivery",
      subject: { kind: "routing-record", record: record.id },
      // Nothing was attempted, so the job's first attempt is the first.
      attempt: 0,
      enqueuedAt: record.at,
      notBefore: later(record.at, config.triggerWindow),
    },
  ]);

  await recordAction(ports, tx, {
    kind: "template-fired",
    subject: record.item,
    // The person tagged; notemap only carried out what the tag says.
    by: { kind: "person" },
    at: record.at,
    detail: {
      record: record.id,
      template: template.id,
      name: template.name,
      destination: template.destination,
      capability: template.capability,
      tag,
    },
  });
}

/**
 * A reservation a trigger tag made, removed without delivering, takes that tag
 * with it: tagging is idempotent, so an item that keeps the tag can never be
 * filed by it again. Only a tag-fired one — a template taken in the composer is
 * a person's own act, and their classification is not the cancel's to touch.
 *
 * The entry names the record, so the tag does not read as having removed itself.
 */
export async function releaseTriggerTag(
  ports: PoolPorts,
  tx: PoolTx,
  record: RoutingRecord,
  at: Timestamp,
  by: "person" | "notemap",
): Promise<TagName | undefined> {
  if (record.applied?.firedByTag !== true) return undefined;

  const template = await tx.routingTemplate(record.applied.template);
  // Edited to drop its tag, or deleted outright, inside the window: there is no
  // tag to give back, and one the item keeps is nobody's to take.
  const tag = template?.triggerTag;
  if (template === undefined || tag === undefined) return undefined;

  const item = await tx.item(record.item);
  if (item === undefined) return undefined;
  if (!item.tags.some((held) => held.name === tag)) return undefined;

  await tx.removeTag(record.item, tag);
  await recordAction(ports, tx, {
    kind: "untagged",
    subject: record.item,
    by: { kind: by },
    at,
    detail: { tag, record: record.id, template: template.id },
  });

  return tag;
}

function said(refusal: { readonly kind: string }): string {
  const detail = (refusal as { detail?: unknown }).detail;
  return typeof detail === "string"
    ? `${refusal.kind}: ${detail}`
    : refusal.kind;
}
