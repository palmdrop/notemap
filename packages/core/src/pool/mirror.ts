import {
  projectDestinationRecord,
  projectMirrorRecord,
  projectPoolSettingRecord,
  projectTemplateRecord,
} from "../mirror/record";
import type { PoolPorts, PoolTx } from "#types/api/ports";
import type { Asset } from "#types/domain/asset";
import type { AssetId, JobId, Timestamp } from "#types/domain/ids";
import type { MirrorRecord, MirrorSubject } from "#types/domain/mirror";

export async function enqueueMirrorWrite(
  ports: PoolPorts,
  tx: PoolTx,
  subject: MirrorSubject,
  at: Timestamp,
): Promise<void> {
  if (ports.mirrorWriter === undefined) return;

  await tx.enqueue([
    {
      id: ports.ids.next<JobId>(),
      kind: "mirror",
      subject,
      attempt: 0,
      enqueuedAt: at,
    },
  ]);
}

/** What the mirror holds about something that has gone: nothing, once this runs. */
export async function enqueueMirrorRemove(
  ports: PoolPorts,
  tx: PoolTx,
  subject: MirrorSubject,
  at: Timestamp,
): Promise<void> {
  if (ports.mirrorWriter === undefined) return;

  await tx.enqueue([
    {
      id: ports.ids.next<JobId>(),
      kind: "mirror-remove",
      subject,
      attempt: 0,
      enqueuedAt: at,
    },
  ]);
}

/**
 * Durable state as the mirror would carry it. A read of the *pool*, not of the
 * mirror: a job carries no snapshot, so a write asks for the state at the
 * moment it writes. Absent means the subject has gone, and removing its files
 * is the other job's.
 */
export async function recordFor(
  ports: PoolPorts,
  subject: MirrorSubject,
): Promise<MirrorRecord | undefined> {
  switch (subject.kind) {
    case "destination":
      return destinationRecord(ports, subject);
    case "template":
      return templateRecord(ports, subject);
    case "item":
      return itemRecord(ports, subject);
    case "pool-setting":
      return poolSettingRecord(ports, subject);
  }
}

async function poolSettingRecord(
  ports: PoolPorts,
  subject: Extract<MirrorSubject, { kind: "pool-setting" }>,
): Promise<MirrorRecord | undefined> {
  const held = await ports.store.poolSettings();
  const record = held.find((each) => each.name === subject.setting);
  return record === undefined ? undefined : projectPoolSettingRecord(record);
}

async function templateRecord(
  ports: PoolPorts,
  subject: Extract<MirrorSubject, { kind: "template" }>,
): Promise<MirrorRecord | undefined> {
  const template = await ports.store.routingTemplate(subject.template);
  return template === undefined ? undefined : projectTemplateRecord(template);
}

async function destinationRecord(
  ports: PoolPorts,
  subject: Extract<MirrorSubject, { kind: "destination" }>,
): Promise<MirrorRecord | undefined> {
  const destination = await ports.store.destination(subject.destination);
  return destination === undefined
    ? undefined
    : projectDestinationRecord(destination);
}

async function itemRecord(
  ports: PoolPorts,
  subject: Extract<MirrorSubject, { kind: "item" }>,
): Promise<MirrorRecord | undefined> {
  const id = subject.item;
  const item = await ports.store.item(id);
  if (item === undefined) return undefined;

  const [artifacts, routing] = await Promise.all([
    ports.store.artifacts(id),
    ports.store.routingRecords(id),
  ]);

  const referenced = new Set<AssetId>([
    ...item.payload.assets.map((ref) => ref.asset),
    ...artifacts.flatMap((artifact) => artifact.assets.map((ref) => ref.asset)),
  ]);

  const resolved = await Promise.all(
    [...referenced].map((asset) => ports.store.asset(asset)),
  );

  // A foreign key stands under every reference, so an unresolved one is
  // unreachable. Projecting a record is not where an inconsistency would be
  // worth discovering: it would fail every mirror write for that item forever.
  const assets = resolved.filter(
    (asset): asset is Asset => asset !== undefined,
  );

  return projectMirrorRecord(item, assets, artifacts, routing);
}
