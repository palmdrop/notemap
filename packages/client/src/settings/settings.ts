import { answered, type Api } from "#api/http";
import type { PoolSetting, UpdatePoolSettingsRequest } from "#api/types";
import type { PoolSettingsApi } from "../types";
import type { Observable } from "rxjs";

export type PoolSettingsDeps = {
  readonly api: Api;
  /** Absent until the first successful read: a cold client has no answer yet. */
  readonly all: Observable<readonly PoolSetting[] | undefined>;
  /** The same cache, read now. */
  readonly held: () => readonly PoolSetting[] | undefined;
  readonly cached: (settings: readonly PoolSetting[]) => Promise<void>;
};

export function createPoolSettings(deps: PoolSettingsDeps): PoolSettingsApi {
  const { api } = deps;

  return {
    all: deps.all,

    get held() {
      return deps.held();
    },

    value(name: string): boolean | undefined {
      return deps.held()?.find((setting) => setting.name === name)?.value;
    },

    async load(): Promise<readonly PoolSetting[]> {
      const answer = await answered(api.GET("/v1/settings"));
      await deps.cached(answer.values);
      return answer.values;
    },

    async change(
      name: string,
      value: boolean,
    ): Promise<readonly PoolSetting[]> {
      const body: UpdatePoolSettingsRequest = { [name]: value };
      const answer = await answered(api.PATCH("/v1/settings", { body }));
      await deps.cached(answer.values);
      return answer.values;
    },
  };
}
