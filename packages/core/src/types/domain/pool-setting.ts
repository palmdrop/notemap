import type { PoolSettingName, Timestamp } from "./ids";

export type PoolSettingType = "boolean";

/** A pool setting's name, type and default, as the running code declares it. */
export type PoolSettingDescriptor = {
  readonly name: PoolSettingName;
  readonly type: PoolSettingType;
  readonly default: boolean;
};

/** What a read answers for one known pool setting: the effective value, unset or not. */
export type PoolSetting = {
  readonly name: PoolSettingName;
  readonly value: boolean;
};

/** What the store holds: only a setting someone has changed, and when. */
export type PoolSettingRecord = {
  readonly name: PoolSettingName;
  readonly value: boolean;
  readonly changedAt: Timestamp;
};
