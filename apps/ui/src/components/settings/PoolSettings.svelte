<script lang="ts">
  import { saidBy } from "@notemap/client";

  import Fact from "$components/settings/Fact.svelte";
  import Section from "$components/settings/Section.svelte";
  import Option from "$components/primitives/composer/Option.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";

  const settings = client.settings.all;
  const pool = reachable();

  let said = $state("");
  let changing = $state<Record<string, boolean>>({});

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
    if (value === now) return;
    changing = { ...changing, [name]: true };
    said = "";
    try {
      await client.settings.change(name, value);
    } catch (error) {
      said = saidBy(error);
    } finally {
      changing = { ...changing, [name]: false };
    }
  }
</script>

<Section name="pool settings">
  {#if $settings === undefined}
    <!-- Not a guess: a cold client, or one that has not yet reached the pool,
         has no answer to draw as either yes or no. -->
    <p role="status" class="mt-4">
      {pool.yes ? "reading…" : "unavailable while the pool is unreachable"}
    </p>
  {:else}
    {#if !pool.yes}
      <p role="status" class="mt-4">
        Pool settings can be read but not changed.
      </p>
    {/if}

    {#each $settings as setting (setting.name)}
      <Fact name={setting.name}>
        {#if pool.yes}
          <span
            class="flex flex-wrap gap-x-[2ch]"
            role="group"
            aria-label={setting.name}
          >
            <Option
              label="yes"
              chosen={setting.value}
              why={changing[setting.name] ? "…" : undefined}
              onchoose={() => void change(setting.name, true, setting.value)}
            />
            <Option
              label="no"
              chosen={!setting.value}
              why={changing[setting.name] ? "…" : undefined}
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
