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
  import { slide } from "$lib/motion";

  const pool = reachable();

  let held = $state<Storage | undefined>(undefined);
  let said = $state("");
  let walking = $state(false);
  let reclaiming = $state(false);
  let took = $state<Reclaimed | undefined>(undefined);
  let asked = $state(false);
  let showPaths = $state(false);

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

  const count = (many: number, one: string) =>
    `${many.toLocaleString("en-GB")} ${one}${many === 1 ? "" : "s"}`;

  const joined = (parts: readonly (string | undefined)[]) =>
    parts.filter((part) => part !== undefined).join(" · ");

  /** `a`, `a and b`, `a, b and c` — the shell says no serial comma. */
  function listed(names: readonly string[]): string {
    if (names.length < 2) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  /**
   * Everything notemap holds on this machine, the daemon's own database
   * included: the section is about what it has taken, and that is one of the
   * things it took. Nothing until the walk lands — the blobs and the mirror are
   * the two largest figures in it, and a total missing them would be the
   * biggest number here and wrong.
   */
  const total = $derived(
    held === undefined || walked === undefined
      ? undefined
      : held.pool.bytes +
          walked.blobs.bytes +
          (walked.mirror?.bytes ?? 0) +
          (held.auth?.bytes ?? 0),
  );

  /**
   * One figure however many roots share it: config can put the mirror on a
   * mount of its own, and two rows is what says it did. Saying 52 GB three
   * times says nothing three times — and `statfs` answers no filesystem id, so
   * roots are grouped by the figure itself rather than by a disk.
   */
  const free = $derived.by(() => {
    const roots: readonly [string, number | undefined][] =
      held === undefined
        ? []
        : [
            ["the pool", held.pool.free],
            ["the blobs", held.assets.free],
            ["the mirror", held.mirror?.free],
          ];

    const grouped: { bytes: number; names: string[] }[] = [];
    for (const [name, bytes] of roots) {
      if (bytes === undefined) continue;
      const same = grouped.find((group) => group.bytes === bytes);
      if (same === undefined) grouped.push({ bytes, names: [name] });
      else same.names.push(name);
    }

    return grouped.map(({ bytes, names }) => ({
      bytes,
      where: `where ${listed(names)} ${names.length === 1 ? "lives" : "live"}`,
    }));
  });

  const paths = $derived(
    held === undefined
      ? []
      : [
          ["pool", held.pool.path],
          ["blobs", held.assets.path],
          ...(held.mirror === undefined
            ? []
            : [["mirror", held.mirror.path] as const]),
          ...(held.auth === undefined
            ? []
            : [["auth", held.auth.path] as const]),
        ],
  );

  const blobsHold = $derived(
    held === undefined || walked === undefined
      ? undefined
      : joined([
          count(walked.blobs.count, "blob"),
          count(held.assets.count, "asset"),
        ]),
  );

  const mirrorHolds = $derived(
    walked?.mirror === undefined
      ? undefined
      : joined([
          count(walked.mirror.records, "record"),
          count(walked.mirror.files, "file"),
        ]),
  );

  const reclaimable = $derived(walked?.reclaimable);
  const grace = $derived(walked?.withinGrace);
</script>

{#snippet row(
  name: string,
  size: string | undefined,
  holds?: string,
  asking?: boolean,
)}
  <span class="tracking-caps uppercase">{name}</span>
  <span class="text-right tabular-nums max-narrow:text-left">
    {#if size === undefined}
      <Asking />
    {:else}
      <span class="font-semibold">{size}</span>
    {/if}
  </span>
  <span class="min-w-0 break-words max-narrow:col-span-2">
    {#if asking === true}
      <!-- A walk already answered once and running again: the remembered
           figures stand, and the mark says a fresher set is coming. -->
      <Asking />
    {:else}
      {holds ?? ""}
    {/if}
  </span>
{/snippet}

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
    <div
      class="mt-1 grid grid-cols-[9rem_6rem_1fr] gap-x-2.5 max-narrow:grid-cols-[1fr_auto] max-narrow:gap-x-[1ch]"
    >
      <!-- The columns are named because there are two of figures: nothing else
           in settings holds enough of them to need saying which is which. -->
      <span></span>
      <span class="text-right tracking-caps uppercase max-narrow:text-left">
        size
      </span>
      <span class="tracking-caps uppercase max-narrow:col-span-2">holds</span>

      {@render row("pool", sizeOf(held.pool.bytes))}
      {@render row(
        "blobs",
        walked === undefined ? undefined : sizeOf(walked.blobs.bytes),
        blobsHold,
      )}
      {#if held.mirror !== undefined}
        {@render row(
          "mirror",
          walked?.mirror === undefined
            ? undefined
            : sizeOf(walked.mirror.bytes),
          mirrorHolds,
        )}
      {/if}
      {#if held.auth !== undefined}
        <!-- Nothing in `holds`: what a database holds is not a figure, and a
             filler to fill the column would be one more thing to read. -->
        {@render row("auth", sizeOf(held.auth.bytes))}
      {/if}

      <span></span>
      <span class="my-1 border-t border-ink"></span>
      <span class="max-narrow:col-span-2"></span>

      {@render row(
        "total",
        total === undefined ? undefined : sizeOf(total),
        undefined,
        walking && total !== undefined,
      )}
    </div>

    <div
      class="mt-5 grid grid-cols-[9rem_6rem_1fr] gap-x-2.5 max-narrow:grid-cols-[1fr_auto] max-narrow:gap-x-[1ch]"
    >
      {#each free as where, at (where.bytes)}
        {@render row(at === 0 ? "free" : "", sizeOf(where.bytes), where.where)}
      {/each}

      {#if reclaimable !== undefined}
        {@render row(
          "unused",
          sizeOf(reclaimable.bytes),
          reclaimable.count === 0
            ? "no blob is held for nothing"
            : `${count(reclaimable.count, "blob")} nothing names`,
        )}
        <span></span>
        <span></span>
        <span class="max-narrow:col-span-2">
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
          {#if grace !== undefined && grace.count > 0}
            <span class="ml-[1ch]">
              {count(grace.count, "blob")} waiting out the grace window
            </span>
          {/if}
          {#if took !== undefined}
            <span class="ml-[1ch]">
              took {count(took.blobs, "blob")}, {sizeOf(took.bytes)}
            </span>
          {/if}
        </span>
      {/if}

      {#if held.assets.saved > 0}
        {@render row(
          "saved",
          sizeOf(held.assets.saved),
          "identical bytes held once",
        )}
      {/if}
    </div>

    <div class="mt-5">
      <Fact name="paths">
        <Action onclick={() => (showPaths = !showPaths)}>
          {showPaths ? "hide" : "show"}
        </Action>
      </Fact>

      {#if showPaths}
        <div transition:slide={{ magnitude: "short" }}>
          {#each paths as [name, path] (name)}
            <Fact {name}>
              <span class="block break-all">{path}</span>
            </Fact>
          {/each}
        </div>
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
    </div>
  {/if}

  {#if said !== ""}
    <p role="status" class="mt-4 text-alarm">{said}</p>
  {/if}
</Section>
