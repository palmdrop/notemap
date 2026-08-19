<script lang="ts">
  import { onMount } from "svelte";
  import { saidBy } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import ActionRow from "$components/primitives/controls/ActionRow.svelte";
  import Content from "$components/primitives/register/Content.svelte";
  import Label from "$components/primitives/register/Label.svelte";
  import Row from "$components/primitives/register/Row.svelte";
  import Stamp from "$components/primitives/marks/Stamp.svelte";
  import { PICTURE, TYPED } from "$lib/channels";
  import { client } from "$lib/client";

  let text = $state("");
  let chosen = $state<File | undefined>(undefined);
  let busy = $state(false);
  let said = $state("");
  let bad = $state(false);
  let picker: HTMLInputElement;

  /** The stamp is the one the capture will keep, so it cannot go stale on the page. */
  let at = $state(new Date().toISOString());
  onMount(() => {
    const tick = setInterval(() => (at = new Date().toISOString()), 20_000);
    return () => clearInterval(tick);
  });

  function pick(event: Event) {
    chosen = (event.currentTarget as HTMLInputElement).files?.[0];
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (chosen === undefined && text.trim() === "") return;

    busy = true;
    try {
      // The bytes are a round trip whatever happens: the pool mints the id the
      // capture then references, so there is nothing to apply optimistically.
      let asset: string | undefined;
      if (chosen !== undefined) {
        bad = false;
        said = "uploading…";
        asset = (await client.uploadAsset(chosen)).id;
      }

      await client.capture({
        channel: chosen === undefined ? TYPED : PICTURE,
        text,
        ...(asset === undefined ? {} : { asset }),
      });

      text = "";
      chosen = undefined;
      picker.value = "";
      said = "";
    } catch (error) {
      said = saidBy(error);
      bad = true;
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={submit}>
  <Row>
    <Stamp {at} />
    <Content>
      <textarea
        bind:value={text}
        placeholder="Anything worth keeping…"
        aria-label="What to capture"
        class="min-h-18 w-full resize-y bg-transparent font-prose text-prose placeholder:text-ink-muted"
      ></textarea>
    </Content>

    <Label />
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
  </Row>
</form>
