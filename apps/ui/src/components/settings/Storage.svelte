<script lang="ts">
  import { saidBy, type Reclaimed, type Storage } from "@notemap/client";

  import Fact from "$components/settings/Fact.svelte";
  import Section from "$components/settings/Section.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import Asking from "$components/primitives/marks/Asking.svelte";
  import Lead from "$components/primitives/text/Lead.svelte";
  import { client } from "$lib/client";
  import { reachable } from "$lib/reachable.svelte";
  import { sizeOf } from "$lib/attachments";

  const pool = reachable();

  let held = $state<Storage | undefined>(undefined);
  let said = $state("");
  let walking = $state(false);
  let reclaiming = $state(false);
  let took = $state<Reclaimed | undefined>(undefined);
  let asked = $state(false);

  /**
   * Which look the answers belong to. A walk outstanding when the section
   * looks again would otherwise land on top of the fresher reading.
   */
  let look = 0;

  const walked = $derived(held?.measured);

  /**
   * The cheap half and the walk are asked for in the same moment: the first
   * draws everything but the blobs, and the walk replaces it when it answers.
   * The daemon holds the last measurement, so what the read answers is a figure
   * from whenever it was taken rather than nothing.
   */
  async function reread(after?: Reclaimed) {
    const mine = (look += 1);
    said = "";
    took = after;
    walking = true;

    // Only where there is nothing drawn yet: a later look already has figures
    // to stand on, and this answer could not replace them.
    if (held === undefined) {
      void client.storage.read().then(
        (answer) => {
          if (mine === look && held === undefined) held = answer;
        },
        () => undefined,
      );
    }

    try {
      const answer = await client.storage.measure();
      if (mine === look) held = answer;
    } catch (error) {
      if (mine === look) said = saidBy(error);
    } finally {
      if (mine === look) walking = false;
    }
  }

  /**
   * What it took is handed to the look that follows it, so the figures and the
   * line explaining them arrive together — and any later look drops the line,
   * which by then is about blobs nobody is being shown.
   */
  async function reclaim() {
    reclaiming = true;
    said = "";
    took = undefined;
    try {
      await reread(await client.storage.reclaim());
    } catch (error) {
      said = saidBy(error);
    } finally {
      reclaiming = false;
    }
  }

  // Nothing is cached, so the section asks as it opens, and again whenever the
  // pool comes back into reach.
  $effect(() => {
    if (pool.yes && !asked) {
      asked = true;
      void reread();
    }
    if (!pool.yes) asked = false;
  });

  const free = (bytes: number | undefined) =>
    bytes === undefined ? undefined : `(${sizeOf(bytes)} free)`;

  const count = (many: number, one: string) =>
    `${many.toLocaleString("en-GB")} ${one}${many === 1 ? "" : "s"}`;

  const assetsSays = $derived(
    held === undefined
      ? ""
      : [
          count(held.assets.count, "asset"),
          held.assets.saved > 0
            ? `${sizeOf(held.assets.saved)} saved by holding identical bytes once`
            : undefined,
        ]
          .filter((part) => part !== undefined)
          .join(", "),
  );

  const mirrorSays = $derived(
    walked?.mirror === undefined
      ? undefined
      : `${count(walked.mirror.records, "record")}, ${count(walked.mirror.files, "file")}`,
  );

  const reclaimable = $derived(walked?.reclaimable);
  const grace = $derived(walked?.withinGrace);
</script>

<Section name="storage">
  {#if held === undefined}
    <!-- Nothing is cached, so there is no older figure to draw instead. -->
    <p role="status" class="mt-4">
      {#if pool.yes}
        <Asking subject="storage" />
      {:else}
        unavailable while the pool is unreachable
      {/if}
    </p>
  {:else}
    <Fact name="pool">
      <span class="block break-all">{held.pool.path}</span>
      <Lead lead={sizeOf(held.pool.bytes)} rest={free(held.pool.free)} />
    </Fact>

    <Fact name="assets">
      <span class="block break-all">{held.assets.path}</span>
      <span class="block">
        {#if walked === undefined}
          <Asking />
        {:else}
          <Lead
            lead={sizeOf(walked.blobs.bytes)}
            rest={[count(walked.blobs.count, "blob"), free(held.assets.free)]
              .filter((part) => part !== undefined)
              .join(" ")}
          />
        {/if}
        {#if walking && walked !== undefined}
          <Asking />
        {/if}
      </span>
      <span class="block">{assetsSays}</span>

      {#if reclaimable !== undefined}
        <span class="flex flex-wrap items-baseline gap-x-[1ch]">
          <span>
            {reclaimable.count === 0
              ? "no unused blobs"
              : `${count(reclaimable.count, "unused blob")}, ${sizeOf(reclaimable.bytes)}`}
          </span>
          <Action
            disabled={reclaimable.count === 0}
            working={reclaiming}
            title={reclaimable.count === 0
              ? "there is nothing to reclaim"
              : undefined}
            onclick={() => void reclaim()}
          >
            reclaim now
          </Action>
        </span>
        {#if grace !== undefined && grace.count > 0}
          <span class="block">
            {count(grace.count, "blob")} waiting out the grace window
          </span>
        {/if}
        {#if took !== undefined}
          <span class="block">
            took {count(took.blobs, "blob")}, {sizeOf(took.bytes)}
          </span>
        {/if}
      {/if}
    </Fact>

    {#if held.mirror !== undefined}
      <Fact name="mirror">
        <span class="block break-all">{held.mirror.path}</span>
        <span class="block">
          {#if walked?.mirror === undefined}
            <Asking />
          {:else}
            <Lead
              lead={sizeOf(walked.mirror.bytes)}
              rest={[mirrorSays, free(held.mirror.free)]
                .filter((part) => part !== undefined)
                .join(" ")}
            />
          {/if}
        </span>
      </Fact>
    {/if}

    {#if held.auth !== undefined}
      <Fact name="auth">
        <span class="block break-all">{held.auth.path}</span>
        <Lead lead={sizeOf(held.auth.bytes)} />
      </Fact>
    {/if}

    {#if held.deployment !== undefined}
      <Fact name="deployment">
        <Lead
          lead={held.deployment.name}
          rest={held.deployment.contained
            ? "the paths above are inside the container"
            : undefined}
        />
      </Fact>
    {/if}
  {/if}

  {#if said !== ""}
    <p role="status" class="mt-4 text-alarm">{said}</p>
  {/if}
</Section>
