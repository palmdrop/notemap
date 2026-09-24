<script lang="ts">
  import type { Unfurl } from "@notemap/client";

  import {
    UNFURL_NOT_READ,
    UNFURL_SAYS_NOTHING,
    UNFURL_UNREACHABLE,
  } from "$lib/said";
  import { unfurled } from "$lib/unfurls";

  /**
   * One link's block, the same height in every state, so a list does not
   * resettle under a reader as answers arrive.
   */
  let { url }: { url: string } = $props();

  type Drawn =
    | { readonly kind: "asking" }
    | { readonly kind: "read"; readonly unfurl: Unfurl }
    | { readonly kind: "said"; readonly said: string };

  let drawn = $state<Drawn>({ kind: "asking" });

  $effect(() => {
    const asking = url;
    drawn = { kind: "asking" };
    unfurled(asking).then(
      (unfurl) => {
        if (asking !== url) return;
        if (unfurl === undefined) drawn = { kind: "asking" };
        else if (!unfurl.reached) {
          drawn = { kind: "said", said: UNFURL_UNREACHABLE };
        } else if (
          unfurl.title === undefined &&
          unfurl.description === undefined &&
          unfurl.image === undefined
        ) {
          drawn = { kind: "said", said: UNFURL_SAYS_NOTHING };
        } else drawn = { kind: "read", unfurl };
      },
      () => {
        if (asking === url) drawn = { kind: "said", said: UNFURL_NOT_READ };
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

<a
  href={url}
  rel="noreferrer"
  data-unfurl={drawn.kind}
  class="flex h-[calc(var(--text-shell--line-height)*4+--spacing(4))] max-w-prose gap-3 overflow-hidden border border-ink px-3 py-2 hover:no-underline"
>
  {#if drawn.kind === "read" && drawn.unfurl.image !== undefined}
    <img
      src={drawn.unfurl.image}
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      class="aspect-square h-full flex-none object-cover"
    />
  {/if}
  <div class="min-w-0 flex-1">
    <div class="truncate">
      {drawn.kind === "read" ? (drawn.unfurl.siteName ?? host) : host}
    </div>
    {#if drawn.kind === "read"}
      {#if drawn.unfurl.title !== undefined}
        <div class="truncate font-semibold">{drawn.unfurl.title}</div>
      {/if}
      {#if drawn.unfurl.description !== undefined}
        <div class="line-clamp-2 break-words">
          {drawn.unfurl.description}
        </div>
      {/if}
    {:else if drawn.kind === "said"}
      <div>{drawn.said}</div>
    {/if}
  </div>
</a>
