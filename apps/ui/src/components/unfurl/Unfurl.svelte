<script lang="ts">
  import { Refused, type Unfurl } from "@notemap/client";

  import Asking from "$components/primitives/marks/Asking.svelte";
  import { revealed, slide } from "$lib/motion";

  import { client } from "$lib/client";
  import { unfurled } from "$lib/unfurls";

  /**
   * One link's block, the same height while it asks as once it has an answer,
   * so a list does not resettle under a reader as answers arrive. A link with
   * nothing to show — out of reach, not read, or saying nothing about itself —
   * folds away rather than holding four lines to say so: the link is still in
   * the capture above.
   */
  let { url }: { url: string } = $props();

  type Drawn =
    | { readonly kind: "asking" }
    | { readonly kind: "read"; readonly unfurl: Unfurl }
    | { readonly kind: "nothing" };

  let drawn = $state<Drawn>({ kind: "asking" });

  $effect(() => {
    const asking = url;
    drawn = { kind: "asking" };
    unfurled(asking).then(
      (unfurl) => {
        if (asking !== url) return;
        if (unfurl === undefined) drawn = { kind: "asking" };
        else if (
          !unfurl.reached ||
          (unfurl.title === undefined &&
            unfurl.description === undefined &&
            unfurl.image === undefined)
        ) {
          drawn = { kind: "nothing" };
        } else drawn = { kind: "read", unfurl };
      },
      (error: unknown) => {
        if (asking !== url) return;
        if (error instanceof Refused && error.code === "unfurl-off") {
          // Turned off elsewhere since this device last read it: reading it
          // again takes every block away.
          void client.settings.load().catch(() => undefined);
        } else {
          drawn = { kind: "nothing" };
        }
      },
    );
  });

  const host = $derived.by(() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  });
</script>

<!-- The height is on the inside, so the rule and the padding add to four lines
     rather than coming out of them. -->
{#if drawn.kind !== "nothing"}
  <!-- Not a link: the address in the words is, and a press on the row opens
       the item, as a press anywhere on it does. -->
  <div class="pt-2" out:slide={{ fade: true }}>
    <div
      data-unfurl={drawn.kind}
      class="flex max-w-prose gap-3 overflow-hidden rounded-control border border-tag-line bg-tag px-3 py-2.5"
    >
      {#if drawn.kind === "read" && drawn.unfurl.image !== undefined}
        <!-- The picture's room is kept once one is offered, so the words
             beside it never move when it loads. -->
        <div class="aspect-square h-12 flex-none overflow-hidden rounded-tag">
          <img
            src={drawn.unfurl.image}
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
            {@attach revealed}
            class="size-full object-cover opacity-0 transition-opacity duration-(--duration-short) ease-fade data-loaded:opacity-100"
          />
        </div>
      {/if}
      <div class="min-w-0 flex-1">
        {#if drawn.kind === "read"}
          {#if drawn.unfurl.title !== undefined}
            <div class="truncate font-semibold">{drawn.unfurl.title}</div>
          {/if}
          {#if drawn.unfurl.description !== undefined}
            <div class="line-clamp-2 text-small break-words">
              {drawn.unfurl.description}
            </div>
          {/if}
          <div class="truncate text-small text-muted">
            {drawn.unfurl.siteName ?? host}
          </div>
        {:else}
          <div class="truncate text-small text-muted">{host}</div>
          <Asking />
        {/if}
      </div>
    </div>
  </div>
{/if}
