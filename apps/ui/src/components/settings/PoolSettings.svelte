<script lang="ts">
  import { saidBy } from "@notemap/client";

  import Section from "$components/settings/Section.svelte";
  import Segmented from "$components/primitives/blocks/Segmented.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";

  import { poolSettingLabel } from "./pool-setting-label";

  const settings = client.settings.all;
  const pool = reachable();

  let said = $state("");
  /** The value each setting is being changed to, while the pool is asked. */
  let changing = $state<Record<string, boolean | undefined>>({});

  async function read() {
    said = "";
    try {
      await client.settings.load();
    } catch (error) {
      said = saidBy(error);
    }
  }

  // What this device cached may be stale, so opening the section, or the pool
  // coming back into reach, always asks again.
  $effect(() => {
    if (pool.yes) void read();
  });

  async function change(name: string, value: boolean, now: boolean) {
    if (value === now || changing[name] !== undefined) return;
    changing = { ...changing, [name]: value };
    said = "";
    try {
      await client.settings.change(name, value);
    } catch (error) {
      said = saidBy(error);
    } finally {
      changing = { ...changing, [name]: undefined };
    }
  }
</script>

<Section name="pool settings">
  {#if $settings === undefined}
    <!-- Not a guess: a cold client, or one that has not yet reached the pool,
         has no answer to draw as either yes or no. -->
    <p role="status" class="m-0 px-gutter py-4">
      {#if pool.yes}
        <Asking />
      {:else}
        unavailable while the pool is unreachable
      {/if}
    </p>
  {:else}
    {#if !pool.yes}
      <p role="status" class="m-0 px-gutter py-3 text-small text-muted">
        The pool is out of reach. Pool settings can be read but not changed.
      </p>
    {/if}

    <p class="m-0 px-gutter pt-3 text-small text-muted">
      Kept by the pool, for every device.
    </p>
    {#each $settings as setting (setting.name)}
      <div class="border-b border-rule px-gutter py-3">
        <span class="mb-1.5 block">{poolSettingLabel(setting.name)}</span>
        <Segmented
          label={poolSettingLabel(setting.name)}
          value={setting.value ? "yes" : "no"}
          disabled={!pool.yes || changing[setting.name] !== undefined}
          options={[
            { value: "yes", word: "yes" },
            { value: "no", word: "no" },
          ]}
          onchoose={(one) =>
            void change(setting.name, one === "yes", setting.value)}
        />
      </div>
    {/each}
  {/if}

  {#if said !== ""}
    <p role="status" class="m-0 px-gutter py-3 text-danger">{said}</p>
  {/if}
</Section>
