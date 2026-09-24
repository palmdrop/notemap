<script lang="ts">
  import { saidBy, type MintedToken, type Token } from "@notemap/client";

  import Fact from "$components/settings/Fact.svelte";
  import Section from "$components/settings/Section.svelte";
  import Action from "$components/primitives/controls/Action.svelte";
  import { client } from "$lib/client";
  import { copyable } from "$lib/clipboard";
  import { log } from "$lib/log.svelte";
  import { session } from "$lib/session.svelte";

  const FIELD = "w-full border-b border-ink bg-transparent focus:outline-none";

  const who = session();

  let signingOut = $state(false);
  let signOutFailed: string | undefined = $state(undefined);

  async function signOut() {
    signingOut = true;
    signOutFailed = undefined;

    try {
      await client.logout();
    } catch (error) {
      // The cache is dropped either way; this only says the daemon was not told.
      signOutFailed = saidBy(error);
    } finally {
      signingOut = false;
      // Dropped either way, on the same terms as the client's own cache: the
      // log is the pool's and this shell is the only thing holding it.
      log.forget();
    }
  }

  let held = $state<readonly Token[]>([]);
  let asked = $state(false);
  let addingToken = $state(false);
  let name = $state("");
  let going = $state(false);
  let said = $state("");

  /**
   * Held here and nowhere else: the daemon stored a hash, so this is the only
   * moment the string exists anywhere a person can read it.
   */
  let minted = $state<MintedToken | undefined>(undefined);
  let copied = $state(false);

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
      addingToken = false;
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

<Section name="access">
  {#if who.canSignOut}
    <Fact name="signed in">
      <span class="flex flex-wrap items-baseline justify-between gap-x-[2ch]">
        <span>
          this browser holds a session
          {#if signOutFailed !== undefined}
            <span class="text-alarm">— {signOutFailed}</span>
          {/if}
        </span>
        <Action disabled={signingOut} onclick={() => void signOut()}>
          sign out
        </Action>
      </span>
    </Fact>
  {:else}
    <Fact name="open">
      no password is set, so every request is let through — run
      <code>notemap password set</code> where the daemon runs to close the door
    </Fact>
  {/if}

  {#if who.canSignOut}
    <Section name="access tokens" sub>
      {#each held as token (token.id)}
        <Fact name={token.name}>
          <span
            class="flex flex-wrap items-baseline justify-between gap-x-[2ch]"
          >
            <span>{why(token)}</span>
            <Action disabled={going} onclick={() => void revoke(token)}>
              revoke
            </Action>
          </span>
        </Fact>
      {/each}

      {#if minted !== undefined}
        <div class="mt-4 border border-alarm p-3">
          <p class="text-alarm">Copy now. The token will not be shown again.</p>
          <p class="mt-2 break-all select-all">{minted.token}</p>
          <div class="mt-2 flex flex-wrap items-baseline gap-x-6">
            {#if copyable()}
              <Action onclick={() => void copy()}>
                <span class="font-semibold">{copied ? "copied" : "copy"}</span>
              </Action>
            {/if}
            <Action onclick={() => (minted = undefined)}>done</Action>
          </div>
        </div>
      {/if}

      {#if addingToken}
        <form
          onsubmit={mint}
          class="mt-4 flex flex-wrap items-baseline gap-x-3"
        >
          <label for="token-name" class="tracking-caps uppercase">name</label>
          <input
            id="token-name"
            bind:value={name}
            class="{FIELD} max-w-[24ch] flex-1"
          />
          <Action submit disabled={going || name.trim() === ""}>create</Action>
        </form>
      {:else}
        <div class="mt-4">
          <Action onclick={() => (addingToken = true)}>+ add a token</Action>
        </div>
      {/if}

      {#if said !== ""}
        <p role="status" class="mt-3 text-alarm">{said}</p>
      {/if}
    </Section>
  {/if}
</Section>
