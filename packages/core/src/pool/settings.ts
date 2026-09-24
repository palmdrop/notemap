import { recordAction } from "./actions";
import { enqueueMirrorWrite } from "./mirror";
import { ok, refused } from "#utils/result";
import type { PoolConfig } from "#types/api/config";
import type { PoolPorts } from "#types/api/ports";
import type { PoolSettingRefusal } from "#types/api/refusal";
import type { PoolSettingName } from "#types/domain/ids";
import type { JsonValue } from "#types/json";
import type {
  PoolSetting,
  PoolSettingDescriptor,
  PoolSettingRecord,
} from "#types/domain/pool-setting";
import type { Result } from "#types/result";

export const POOL_SETTINGS: readonly PoolSettingDescriptor[] = [
  { name: "unfurl" as PoolSettingName, type: "boolean", default: true },
];

export async function list(
  config: PoolConfig,
  ports: PoolPorts,
): Promise<readonly PoolSetting[]> {
  const held = await ports.store.poolSettings();
  const changed = new Map(held.map((record) => [record.name, record.value]));

  return config.poolSettings.map((declared) => ({
    name: declared.name,
    value: changed.get(declared.name) ?? declared.default,
  }));
}

function declaredSetting(
  config: PoolConfig,
  name: PoolSettingName,
): PoolSettingDescriptor | undefined {
  return config.poolSettings.find((each) => each.name === name);
}

function wrongType(declared: PoolSettingDescriptor, value: JsonValue): boolean {
  switch (declared.type) {
    case "boolean":
      return typeof value !== "boolean";
  }
}

export function change(
  config: PoolConfig,
  ports: PoolPorts,
  name: PoolSettingName,
  value: JsonValue,
): Promise<Result<PoolSetting, PoolSettingRefusal>> {
  const declared = declaredSetting(config, name);
  if (declared === undefined) {
    return Promise.resolve(
      refused<PoolSetting, PoolSettingRefusal>({
        kind: "unknown-pool-setting",
        setting: name,
        allowed: config.poolSettings.map((each) => each.name),
      }),
    );
  }

  if (wrongType(declared, value)) {
    return Promise.resolve(
      refused<PoolSetting, PoolSettingRefusal>({
        kind: "pool-setting-invalid",
        setting: name,
        expected: declared.type,
      }),
    );
  }

  const settled = value as boolean;

  return ports.store.transaction(async (tx) => {
    const before = await tx.poolSettings();
    const stored = before.find((each) => each.name === name);
    if (stored?.value === settled) {
      return ok<PoolSetting, PoolSettingRefusal>({ name, value: settled });
    }
    const previous = stored?.value ?? declared.default;

    const at = ports.clock.now();
    const record: PoolSettingRecord = { name, value: settled, changedAt: at };
    await tx.setPoolSetting(record);

    await recordAction(ports, tx, {
      kind: "pool-setting-changed",
      by: { kind: "person" },
      at,
      detail: { setting: name, from: previous, to: settled },
    });
    await enqueueMirrorWrite(
      ports,
      tx,
      { kind: "pool-setting", setting: name },
      at,
    );

    return ok<PoolSetting, PoolSettingRefusal>({ name, value: settled });
  });
}
