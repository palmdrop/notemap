<script lang="ts">
  /**
   * Work under way that this shell is not waiting on: a quarter going round a
   * square. Never the asking mark, which is a request the shell holds no answer
   * to. `said` is what a reader that cannot see it is told, and the hover.
   */
  let { said }: { said: string } = $props();
</script>

<span
  role="img"
  aria-label={said}
  title={said}
  class="inline-block size-2 shrink-0 border border-current align-baseline"
>
  <span
    class="block size-1/2 animate-turn bg-current motion-reduce:animate-none"
  ></span>
</span>
