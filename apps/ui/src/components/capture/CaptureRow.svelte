<script lang="ts">
  import { onMount } from "svelte";
  import { saidBy } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import Body from "$components/primitives/register/Body.svelte";
  import Rail from "$components/primitives/register/Rail.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import { PICTURE, TYPED } from "$lib/channels";
  import { client } from "$lib/client";

  let text = $state("");
  let chosen = $state<File | undefined>(undefined);
  let busy = $state(false);
  let said = $state("");
  let bad = $state(false);
  let picker: HTMLInputElement;

  /**
   * The row shows a minute and the capture is stamped when it is sent, so the
   * clock turns over on the minute boundary rather than on an interval that
   * straddles one — otherwise the row reads 14:07 and the item lands at 14:08.
   */
  let at = $state(new Date().toISOString());
  onMount(() => {
    let tick: ReturnType<typeof setTimeout>;

    const onward = () => {
      const now = new Date();
      at = now.toISOString();
      tick = setTimeout(
        onward,
        60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()),
      );
    };

    onward();
    return () => clearTimeout(tick);
  });

  function pick(event: Event) {
    chosen = (event.currentTarget as HTMLInputElement).files?.[0];
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (chosen === undefined && text.trim() === "") return;

    busy = true;
    said = "";
    bad = false;
    try {
      // Held rather than uploaded: the bytes go up with the capture when it
      // drains, so nothing here waits on the pool.
      const asset =
        chosen === undefined ? undefined : await client.attach(chosen);

      await client.capture({
        channel: chosen === undefined ? TYPED : PICTURE,
        text,
        ...(asset === undefined ? {} : { asset }),
      });

      text = "";
      chosen = undefined;
      picker.value = "";
    } catch (error) {
      said = saidBy(error);
      bad = true;
    } finally {
      busy = false;
    }
  }
</script>

<Rail first>
  <Stamp {at} />
  <div class="mt-2 text-ink-muted">not captured</div>
</Rail>

<Body first>
  <form onsubmit={submit}>
    <textarea
      bind:value={text}
      placeholder="Anything worth keeping…"
      aria-label="What to capture"
      class="min-h-18 w-full resize-y bg-transparent font-prose text-prose placeholder:text-ink-muted"
    ></textarea>

    <ActionRow>
      <Action primary submit disabled={busy}>capture</Action>
      <Action disabled={busy} onclick={() => picker.click()}>attach</Action>

      <input
        bind:this={picker}
        type="file"
        accept="image/*"
        onchange={pick}
        aria-label="A picture to capture"
        class="hidden"
      />

      {#if chosen !== undefined}
        <span class="break-words text-ink-muted">{chosen.name}</span>
      {/if}
      {#if said !== ""}
        <span role="status" class={bad ? "text-accent" : "text-ink-muted"}>
          {said}
        </span>
      {/if}
    </ActionRow>
  </form>
</Body>
