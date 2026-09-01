<script lang="ts">
  import { saidBy, type MintedToken, type Token } from "@notemap/client";

  import Action from "$components/primitives/controls/Action.svelte";
  import Row from "$components/settings/Row.svelte";
  import Section from "$components/settings/Section.svelte";
  import { client } from "$lib/client";
  import { session } from "$lib/session.svelte";

  const FIELD =
    "w-full border-b border-ink bg-transparent font-mono focus:outline-none";

  const who = session();

  let held = $state<readonly Token[]>([]);
  let asked = $state(false);
  let name = $state("");
  let going = $state(false);
  let said = $state("");

  /**
   * Held here and nowhere else: the daemon stored a hash, so this is the only
   * moment the string exists anywhere a person can read it.
   */
  let minted = $state<MintedToken | undefined>(undefined);
  let copied = $state(false);

  const tally = $derived(
    held.length === 0 ? "none yet" : `${String(held.length)} held`,
  );

  const day = (instant?: string) =>
    instant === undefined ? undefined : instant.slice(0, 10);

  const why = (token: Token) =>
    token.lastUsedAt === undefined
      ? `made ${day(token.createdAt) ?? ""} · never used`
      : `made ${day(token.createdAt) ?? ""} · last used ${day(token.lastUsedAt) ?? ""}`;

  async function attempt(what: () => Promise<unknown>) {
    said = "";
    going = true;

    try {
      await what();
    } catch (error) {
      said = saidBy(error);
    } finally {
      going = false;
    }
  }

  const read = () =>
    attempt(async () => {
      held = await client.tokens.list();
    });

  // Only a session may read these at all, so nothing is asked until there is
  // one — a token-carrying shell would be answered `session-required`.
  $effect(() => {
    if (who.canSignOut && !asked) {
      asked = true;
      void read();
    }
  });

  const mint = (event: SubmitEvent) => {
    event.preventDefault();
    if (going || name.trim() === "") return;

    void attempt(async () => {
      minted = await client.tokens.mint({ name: name.trim() });
      copied = false;
      name = "";
      held = await client.tokens.list();
    });
  };

  const revoke = (token: Token) =>
    attempt(async () => {
      await client.tokens.revoke(token.id);
      if (minted?.id === token.id) minted = undefined;
      held = await client.tokens.list();
    });

  async function copy() {
    if (minted === undefined) return;

    try {
      await navigator.clipboard.writeText(minted.token);
      copied = true;
    } catch {
      // A clipboard a browser will not hand over is not a failure worth a
      // refusal: the string is on the screen to be selected either way.
      copied = false;
    }
  }
</script>

{#if who.canSignOut}
  <Section name="access tokens" aside={tally}>
    <p class="mt-4 text-ink-muted">
      What something that is not a browser carries — a script, a phone's outbox,
      anything with no way to sign in. Each reaches everything this session
      does, except these tokens and signing every browser out.
    </p>

    {#each held as token (token.id)}
      <Row mark="·" what={token.name} why={why(token)}>
        <span class="ml-6 max-narrow:ml-[var(--spacing-mark)]">
          <Action disabled={going} onclick={() => void revoke(token)}>
            Revoke
          </Action>
        </span>
      </Row>
    {/each}

    {#if minted !== undefined}
      <div class="mt-4 border border-accent p-3">
        <p class="text-accent">
          Copy it now. The daemon kept a hash, so this is the only time it can
          be read — one that was not written down is replaced, not recovered.
        </p>
        <p class="mt-3 font-mono break-all select-all">{minted.token}</p>
        <p class="mt-3">
          <Action onclick={() => void copy()}>
            {copied ? "Copied" : "Copy"}
          </Action>
          <span class="ml-6">
            <Action onclick={() => (minted = undefined)}>Done</Action>
          </span>
        </p>
      </div>
    {/if}

    <form onsubmit={mint} class="mt-6 flex flex-wrap items-baseline gap-x-3">
      <label for="token-name" class="tracking-wider uppercase">name</label>
      <input
        id="token-name"
        bind:value={name}
        placeholder="the phone in my pocket"
        class="{FIELD} max-w-[24ch] flex-1"
      />
      <Action submit disabled={going || name.trim() === ""}>
        {going ? "minting" : "Mint"}
      </Action>
    </form>

    {#if said !== ""}
      <p role="status" class="mt-4 text-accent">{said}</p>
    {/if}
  </Section>
{/if}
