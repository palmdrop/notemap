<script lang="ts">
  import type { RememberedPlace } from "@notemap/client";

  import Group from "$components/primitives/composer/Group.svelte";
  import { continuing } from "$lib/path-line";
  import { whenOf } from "$lib/when";

  /**
   * Places routed to before, ranked above what the destination merely offers.
   * They sit in the column beside the line, under their own label, because they
   * are consulted rather than typed — and the count goes **beneath** the path,
   * which is the thing being read and never truncates.
   */
  let {
    places,
    value,
    chosen,
    ontake,
  }: {
    places: readonly RememberedPlace[];
    /** What is typed, which the line is still a prefix of. */
    value: string;
    /**
     * Which of `places` — not of what is drawn — `↑↓` has landed on, the line
     * owning that walk. A position in the list this narrows to would hold only
     * as long as the two narrowed it the same way.
     */
    chosen?: number;
    ontake: (value: string) => void;
  } = $props();

  /** Read once when the composer opens: a list that re-dated itself as you typed would be noise. */
  const now = Date.now();

  const shown = $derived(continuing(value, places));
</script>

{#if shown.length > 0}
  <Group name="used before">
    <div id="used-before-places" role="listbox" aria-label="places used before">
      {#each shown as place (place.value)}
        {@const at = places.indexOf(place)}
        <div
          id="used-before-place-{at}"
          role="option"
          tabindex="-1"
          aria-selected={chosen === at}
          class="cursor-default py-0.5 {chosen === at ? 'inverted' : ''}"
          onmousedown={(event) => {
            event.preventDefault();
            ontake(place.value);
          }}
        >
          <div class="break-all">{place.value}</div>
          <div class="text-ink-muted">
            {place.uses} · {whenOf(place.lastAt, now)}
          </div>
        </div>
      {/each}
    </div>
  </Group>
{/if}
