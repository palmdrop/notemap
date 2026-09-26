<script lang="ts">
  import { saidBy } from "@notemap/client";

  import Fact from "$components/settings/Fact.svelte";
  import Section from "$components/settings/Section.svelte";
  import Option from "$components/primitives/composer/Option.svelte";
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
    <p role="status" class="mt-4">
      {#if pool.yes}
        <Asking />
      {:else}
        unavailable while the pool is unreachable
      {/if}
    </p>
  {:else}
    {#if !pool.yes}
      <p role="status" class="mt-4">
        Pool settings can be read but not changed.
      </p>
    {/if}

    {#each $settings as setting (setting.name)}
      <Fact name={poolSettingLabel(setting.name)}>
        {#if pool.yes}
          <span
            class="flex flex-wrap gap-x-[2ch]"
            role="group"
            aria-label={poolSettingLabel(setting.name)}
          >
            <Option
              label="yes"
              chosen={setting.value}
              working={changing[setting.name] === true}
              onchoose={() => void change(setting.name, true, setting.value)}
            />
            <Option
              label="no"
              chosen={!setting.value}
              working={changing[setting.name] === false}
              onchoose={() => void change(setting.name, false, setting.value)}
            />
          </span>
        {:else}
          <span>{setting.value ? "yes" : "no"}</span>
        {/if}
      </Fact>
    {/each}
  {/if}

  {#if said !== ""}
    <p role="status" class="mt-4 text-alarm">{said}</p>
  {/if}
</Section>
