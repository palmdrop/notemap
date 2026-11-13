<script lang="ts">
  /** Waiting to send: something about this is in the outbox and not yet with the pool. */
  let { said }: { said: string } = $props();
</script>

<span
  data-dot
  role="img"
  aria-label={said}
  title={said}
  class="inline-block size-[0.4375rem] shrink-0 rounded-full bg-ink"
></span>
