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
  let showStats = $state(false);
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

  /** `a`, `a and b`, `a, b and c` — the shell says no serial comma. */
  function listed(names: readonly string[]): string {
    if (names.length < 2) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  /**
   * Everything notemap holds on this machine, the daemon's own database
   * included: the section is about what it has taken, and that is one of the
   * things it took. Nothing until the walk lands — the assets and the mirror
   * are the two largest figures in it, and a total missing them would be the
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
   *
   * Which roots a figure covers is said only where there is more than one of
   * them. With a single row it is every root there is, which the row being
   * alone already says.
   */
  const free = $derived.by(() => {
    const roots: readonly [string, number | undefined][] =
      held === undefined
        ? []
        : [
            ["the pool", held.pool.free],
            ["the assets", held.assets.free],
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
      where:
        grouped.length < 2
          ? undefined
          : `where ${listed(names)} ${names.length === 1 ? "lives" : "live"}`,
    }));
  });

  const paths = $derived(
    held === undefined
      ? []
      : [
          ["pool", held.pool.path],
          ["assets", held.assets.path],
          ...(held.mirror === undefined
            ? []
            : [["mirror", held.mirror.path] as const]),
          ...(held.auth === undefined
            ? []
            : [["auth", held.auth.path] as const]),
        ],
  );

  const stats = $derived(
    held === undefined || walked === undefined
      ? []
      : [
          [
            "assets",
            `${count(held.assets.count, "asset")} / ${count(walked.blobs.count, "file")} (${sizeOf(walked.blobs.bytes)})`,
          ],
          ...(walked.mirror === undefined
            ? []
            : [
                [
                  "mirror",
                  `${count(walked.mirror.records, "record")} / ${count(walked.mirror.files, "file")} (${sizeOf(walked.mirror.bytes)})`,
                ] as const,
              ]),
        ],
  );

  const reclaimable = $derived(walked?.reclaimable);
  const grace = $derived(walked?.withinGrace);

  /**
   * The label column `Fact` uses, then the figures right-aligned in a column of
   * their own, with whatever qualifies a figure right-aligned beneath it. Below
   * `narrow` the label gives up its fixed width.
   */
  const GRID =
    "grid grid-cols-[9rem_28ch] gap-x-2.5 max-narrow:grid-cols-[1fr_min(28ch,60%)]";
</script>

{#snippet row(
  name: string,
  size: string | undefined,
  detail?: string,
  asking?: boolean,
)}
  <span class="tracking-caps uppercase">{name}</span>
  <span class="text-right tabular-nums">
    {#if size === undefined}
      <Asking />
    {:else}
      <span class="font-semibold">{size}</span>
    {/if}
  </span>

  <!-- What the size is made of takes a line of its own under the
       figure, at every width, rather than a column beside it. -->
  {#if detail !== undefined || asking === true}
    <span class="col-start-2 min-w-0 text-right break-words">
      {#if asking === true}
        <!-- A walk already answered once and running again: the remembered
             figures stand, and the mark says a fresher set is coming. -->
        <Asking />
      {:else}
        {detail}
      {/if}
    </span>
  {/if}
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
    <div class={GRID}>
      <!-- One head, over the one column that is read down. -->
      <span></span>
      <span class="text-right tracking-caps uppercase"> size </span>

      {@render row("pool", sizeOf(held.pool.bytes))}
      {@render row(
        "assets",
        walked === undefined ? undefined : sizeOf(walked.blobs.bytes),
      )}
      {#if held.mirror !== undefined}
        {@render row(
          "mirror",
          walked?.mirror === undefined
            ? undefined
            : sizeOf(walked.mirror.bytes),
        )}
      {/if}
      {#if held.auth !== undefined}
        {@render row("auth", sizeOf(held.auth.bytes))}
      {/if}
    </div>

    <!-- What the rows above come to, and what is left where they live: the two
         figures a person reads together, set apart by space rather than ruled
         off from what they are a sum of. -->
    <div class="{GRID} mt-5">
      {@render row(
        "total",
        total === undefined ? undefined : sizeOf(total),
        undefined,
        walking && total !== undefined,
      )}
      {#each free as where (where.bytes)}
        {@render row("free", sizeOf(where.bytes), where.where)}
      {/each}
    </div>

    {#if reclaimable !== undefined}
      <div class="{GRID} mt-5">
        {@render row(
          "reclaimable",
          sizeOf(reclaimable.bytes),
          reclaimable.count === 0
            ? undefined
            : `${count(reclaimable.count, "file")} left behind`,
        )}

        <span></span>
        <span class="col-start-2 text-right">
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
          {#if took !== undefined}
            <span class="ml-[1ch]">
              took {count(took.blobs, "file")}, {sizeOf(took.bytes)}
            </span>
          {/if}
        </span>

        {#if grace !== undefined && grace.count > 0}
          <span></span>
          <span class="col-start-2 text-right">
            {count(grace.count, "file")} waiting out the grace window
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
    {/if}

    <div class="mt-5">
      <Fact name="stats">
        <Action onclick={() => (showStats = !showStats)}>
          {showStats ? "hide" : "show"}
        </Action>
      </Fact>

      {#if showStats}
        <div transition:slide={{ magnitude: "short" }}>
          {#each stats as [name, line] (name)}
            <Fact {name}>{line}</Fact>
          {:else}
            <Fact name="">
              <Asking />
            </Fact>
          {/each}
        </div>
      {/if}

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
