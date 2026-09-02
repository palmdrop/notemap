# Review: A webdav destination kind

**Date**: 2026-09-01
**Status**: Resolved
**Scope**: PR #36, `agent/destination-webdav` against `main`
**Plan**: `docs/plans/destination-webdav.md`
**Spec**: `docs/specs/core.md`, `docs/specs/security.md`

---

## Overall

The shape is right and the security half is the best part of it: taking the address out of
`settings` and shipping it with the secret closes the forgery properly rather than papering over
it, and ADR 28 argues the case rather than announcing it. The extraction into
`@notemap/output-markdown` is clean — the filesystem kind lost exactly what was never about a
filesystem, no assertion changed, and the two kinds now share one capability definition instead of
two copies drifting.

The finding that matters is **#1**: assets are written before the note, and every `unreachable`
path after that point contradicts what `core.md` says `unreachable` means — "proof that nothing was
delivered, so a retry cannot duplicate". Here a retry does duplicate, under suffixed names, once
per attempt. The append retry loop is careful about this within one delivery and structurally
cannot be across deliveries.

Everything else is small: a config path that is not expanded the way every other config path is,
and three documentation lines that cannot be followed as written.

---

## Bugs

### 0. Plain HTTP was refused for a sibling container, fatally

*Found by hand on 2026-09-02, not in the blind read — recorded here because it is a finding on this
PR, and fixed in the same commit as this entry, the shape having been settled first.*

`apps/daemon/src/config/load.ts` — `readProfiles` refused any `baseUrl` that was not `https:` unless
the hostname was `127.0.0.1`, `::1` or `localhost`, by reusing `isLoopback`. That predicate belongs
to the cookie code, where the browser's own trust rule is exactly the question; for "would this
password cross a network somebody else is on" it is the wrong one. A Nextcloud beside the daemon on
a compose network is reached as `http://nextcloud`, which is never loopback and has no certificate
to be had — so the check refused the deployment the kind was written for, and
`docker/compose/compose.proxy.yaml` is that deployment.

It also threw at **load**, so a daemon with one such profile exited before serving and compose
restarted it into a loop: one account nothing should be sent to took capture, routing and every
other destination down with it. That is inconsistent with ADR 28, which already accepts a profile
that is merely undeclared validating fine and failing at delivery.

Fixed in two steps, the second on the developer's call: `isPrivateHost` — loopback, RFC1918,
link-local, ULA, and a single-label name — now decides only whether to **warn**, and plain HTTP
anywhere is delivered to. The daemon names the account on startup beside the warning it already
prints for its own plain-HTTP origin. Whether the transport is acceptable past a private address is
not a thing the daemon can tell — a VLAN, a tunnel and a mesh interface all look like the open
internet from here — so it says it and the operator decides. What the file gets wrong stays fatal:
an inline password, a repeated name, a scheme this does not speak.

Worth recording against it: `load.ts:150` refuses an inline `password` by name precisely because
"a warning nobody reads" is not a control, and this is now the daemon relying on one. The
difference is that the transport is a line the operator typed on purpose and the daemon cannot
evaluate, where an inline password is unambiguously wrong wherever it appears.

`docs/specs/security.md`, `docs/running.md`, `apps/daemon/config.example.toml` and the adapter's
README carried the old rule and were changed with it.

### 0b. A destination's settings form shows property names and no descriptions

`apps/ui/src/components/settings/DestinationForm.svelte:131` — the form labels each field with its
raw property name, deliberately: "the label read is the label an error will name". But it drops
`description` entirely, while `RoutingComposer.svelte:149` shows both the title and the description
for a capability's arguments. So the webdav kind's `profile` field arrived as a bare box labelled
`profile`, with the sentence that explains it — "The name of an account in the daemon's
configuration. The address and the password are its, not this destination's." — written into the
schema and never displayed. That is what a person creating the destination has to guess.

Fixed by rendering the description under the label, which leaves the property-name decision intact.
The two forms still disagree about the *label*; that is worth settling, and it is not this PR's.

### 1. `unreachable` is returned after assets have already landed, so a retry duplicates them

`packages/adapters/destination-webdav/src/notes.ts:47`, `:100` — `placeAssets` runs before the
note is written, in both capabilities. Every failure after that point that maps to `Unreachable`
is retried by the delivery runner, and the retry calls `placeAssets` again with a fresh `taken`
set. The names are now occupied by the previous attempt's uploads, so `alternatives()` suffixes.

```
attempt 1: photo.png uploaded → note PUT answers 503 → unreachable
attempt 2: photo.png taken → photo-1.png uploaded → 503 → unreachable
attempt 3: photo-2.png …
```

The append path reaches this by design, not only by accident: exhausting `ATTEMPTS` on `412`
returns `unreachable` (`notes.ts:136`) with the assets for that delivery already in the vault. So a
contended daily note carrying a picture accumulates a copy of the picture per delivery attempt,
and the note that eventually lands links to only the last one.

`docs/specs/core.md:725` is explicit that this is the invariant retry is keyed on. The comment at
`notes.ts:89` claims the narrow version of the property — "an attempt that loses a race re-reads
rather than re-uploading an hour of audio" — which is true within one delivery and is what makes
the gap easy to miss.

Fix: either place assets after the note is written (which trades duplication for orphans on the
window between the two, and is the smaller failure), or make asset placement idempotent for a
retry — a `HEAD`/`PROPFIND` on the wanted name plus a content check, or naming an asset from its
blob hash so a second upload of the same bytes lands on the same name.

The same ordering exists in `destination-fs`, but there `unreachable` needs `EIO`/`ENOSPC`, where
here it is the ordinary outcome of a busy server. Whatever is decided should probably be decided
for both, since the ordering now lives in two copies of one design.

### 2. `passwordFile` is not tilde-expanded, and the example config uses `~`

`apps/daemon/src/config/load.ts` — `readProfiles` returns `profile.passwordFile` verbatim, while
every other path in the same file goes through `expandHome`/`resolve` (`:406`, `:407`, `:415`,
`:423`). `apps/daemon/config.example.toml` documents:

```toml
# passwordFile = "~/.config/notemap/nextcloud-app-password"
```

`readFile("~/.config/…")` is `ENOENT`, so a person following the annotated example gets a daemon
that starts fine and reports every delivery `unreachable` with "could not be read from
~/.config/…". The `~` in that message reads as the shell's own path, which makes it a slow thing
to spot.

Fix: `expandHome(profile.passwordFile)` — the helper is three lines above it, and the file's own
comment at `:236` says `~` is the shell's, not the filesystem's.

---

## Design

### 3. A weak `ETag` turns every append into "somebody else wrote it"

`packages/adapters/destination-webdav/src/notes.ts:125` sends the `ETag` from the `GET` straight
back as `If-Match`. `If-Match` uses strong comparison, so a server that answers `W/"…"` fails the
condition on every attempt regardless of contention — four rounds, then `unreachable` saying
"was written by somebody else during each of 4 attempts". That is a cause the code has not
established, and it is the message a person debugging will believe.

This is not theoretical for the target deployment: a reverse proxy compressing responses is the
ordinary way a strong `ETag` becomes weak, and `docker/compose/compose.proxy.yaml` is exactly that
deployment. The fake server only ever issues strong tags, so nothing in the suite can see it.

Fix: notice `W/` on the way in and say so — either refuse the append naming the weak validator, or
strip the prefix deliberately and accept that the comparison is then weaker than the guarantee the
README states. Silently losing to it is the one option worth ruling out. Worth adding to the
phase 7 questions either way; it sits beside the `ETag`-stability unknown already recorded there.

### 4. `RenderingContext.directory` now means two different things

`packages/output-markdown/src/renderers.ts:13` — the field is undocumented, and the two kinds pass
structurally different values: `destination-fs` passes an absolute filesystem path
(`destination.ts:188`), `destination-webdav` a vault-relative URL path
(`notes.ts:168`). Nothing reads it today, which is why the tests are green, so this is a contract
being set rather than a break.

It matters because the package's whole point is that a renderer written once produces the same
note for both kinds, and this field is the one place that promise does not hold. Either state what
it means — "where the note is going, as that destination names it", which is webdav's reading and
the one a renderer could use — and change the filesystem kind to match, or drop the field until
something needs it.

---

## Minor

### 5. The commented profile in `config.example.toml` cannot be uncommented

`apps/daemon/config.example.toml` shows both `passwordFile` and `passwordEnv` in one `[[webdav]]`
block. The prose two lines above says "exactly one", and `readProfiles` refuses both being set, so
uncommenting the block as printed fails at load. Comment one of the two out a second time, or show
the `passwordEnv` form as a separate note.

### 6. The compose secret path in `docker/compose/config.toml` does not exist

`docker/compose/config.toml:70` names `/run/secrets/notemap-webdav-nextcloud`, while the secret
declared in both compose files is `notemap_webdav_nextcloud` and therefore mounts at
`/run/secrets/notemap_webdav_nextcloud`. `docs/running.md` has the underscored form, and the
existing `notemap_password` secret is underscored too. Following the file that sits next to the
compose files gives an unreadable password.

### 7. `compose.proxy.yaml` has two commented `secrets:` blocks

`docker/compose/compose.proxy.yaml:73` and `:86` — the new one was appended after `networks:`
instead of extending the existing one, so the file now documents the same top-level key twice with
different contents. Uncommenting both is a duplicate mapping key. `compose.yaml` got this right by
editing the block in place.

### 8. The README says a note with no `ETag` is refused; the code reports it unreachable

`packages/adapters/destination-webdav/README.md` — "A note served with no `ETag` is refused rather
than written over blind", but `notes.ts:120` throws `Unreachable`, so the delivery is retried until
`maxAttempts` rather than handed back. The case is also missing from the README's own
refused/unreachable table, which is otherwise complete. `unreachable` is arguably the right answer
— a proxy stripping the header may stop — but the two should agree on which it is.

### 9. An asset name that collides re-uploads the whole stream per candidate

`packages/adapters/destination-webdav/src/assets.ts:209` — `alternatives()` yields up to 100 names
and each one is a full `PUT` of a reopened stream. On a local disk that is free; over the network
an hour of audio hitting a run of taken names is uploaded repeatedly before one lands. Unlikely to
fire, and the shared naming is worth more than the saving, but a smaller bound for remote kinds
would cost nothing.

---

## Non-issues

- **`describe()` never resolves the profile** — deliberate, and argued in ADR 28: a destination
  naming a profile that is not declared validates fine and reports `unreachable` at delivery, on
  the same terms as an unmounted drive. `describe()` doing I/O is what would make a settings screen
  stall on a Nextcloud that is merely asleep.
- **Containment is string arithmetic with no second check** — correct here. Segments are split on
  `/` before resolution and reassembled one `encodeURIComponent` at a time, so nothing a name holds
  can address outside the base URL, and there are no links to chase.
- **A rejected credential is `unreachable`** — matches the filesystem kind's treatment of
  permission errors, and a just-rotated password is the ordinary case. Bounded by `maxAttempts`.
- **`redirect: "manual"` and the 3xx throw** — the one line that would otherwise carry the
  credential to an address the answer chose. Node's fetch returns the real 3xx here rather than an
  opaque response, so the `location` in the message is genuinely available.
- **`create-file` refusing a taken name rather than suffixing** — settled in the plan on 2026-09-01
  and the filesystem kind already behaved this way; `docs/running.md` was the thing that was wrong,
  and this PR corrects it.
- **`asCreateFileArguments` accepting `filename: ""`** — the schema's `minLength: 1` is checked by
  core at route time (`packages/core/src/pool/routing/route.ts:92`), so the empty string never
  reaches the adapter. Shared with the filesystem kind.
- **Assets orphaned when a create is refused** — real, but the filesystem kind has done this since
  it shipped and the ordering is the same in both. Folded into finding #1, which is where the
  decision belongs.
- **`js-yaml` moving from `destination-fs` to `output-markdown`** — follows the frontmatter code;
  `destination-fs` no longer imports it and correctly dropped the dependency. The lockfile change
  is an add, not a regeneration.
- **The `Shipped:` trail** — the plan is `In progress`, and `core.md`, `security.md` and
  `shell.md` all carry dated 2026-09-01 entries linking back to it. Nothing owed.

---

## Verification

`pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` are green on the branch as it stands.
`pnpm test:stack` not run; nothing here crosses the HTTP surface beyond the kinds list, which
`apps/daemon/src/routes/destinations.test.ts` covers.

---

## Resolution

Reconciled with the developer's own review on 2026-09-02. Their four comments are `T1`–`T4` below,
and one more arrived in conversation as `T5`.

0. **Fixed.** `isPrivateHost` — loopback, RFC1918, link-local, ULA, and a single-label name — and
   plain HTTP past that is **warned about on startup rather than refused**, the developer's call:
   whether a network is safe is not a thing the daemon can tell, and refusing at load took the whole
   daemon down over one account. The judgement moved into the adapter (see T1) and the warning is
   printed by `main.ts` from what `ports.ts` collected.
0b. **Fixed.** The settings form renders each field's `description`. The label is still the property
   name, which the form decided deliberately; the two forms disagreeing about labels is left alone.
1. **Fixed.** An asset is named `stem-<digest8>.ext` from its blob, so the name a retry computes is
   the name the failed attempt wrote and `unreachable` stops promising something untrue. Both kinds
   share it. `alternatives()` went with it — there is no collision to step around once the name is
   the content — and so did the 100-candidate re-upload, which was finding #9.
2. **Fixed.** `passwordFile` goes through `expandHome`/`resolve` like every other path in `load.ts`.
3. **Fixed.** A weak `ETag` is named as what it is instead of being retried into a report of
   contention. The fake can issue weak validators now, which is what tests it.
4. **Fixed.** `RenderingContext.directory` is documented as the folder *as the destination names
   it* — relative to the root, URL separators — and the filesystem kind stopped passing an absolute
   path. A note can no longer carry the daemon's own filesystem into somebody's vault.
5. **Fixed.** The example config shows the two secret forms as two blocks, since one profile may not
   set both.
6. **Fixed.** `docker/compose/config.toml` names the path compose actually mounts.
7. **Fixed.** `compose.proxy.yaml` has one commented `secrets:` block again.
8. **Fixed.** The README says unreachable, and the no-`ETag` and weak-`ETag` cases are both in its
   table.
9. **Fixed** by 1, above.

**T1/T2 — the daemon should not know a kind's internals.** Acted on as far as it goes without a
slice of its own. The config block is now `[[accounts]]`, generic, with `kind` a string the daemon
passes on; `accountsFor(kind, …)` reads secrets for anybody; and the WebDAV transport judgement
moved into `@notemap/destination-webdav` as `transportWarnings`, collected by `ports.ts` — the one
seam ADR 8 says is the host's — and merely printed by `main.ts`. What is left is that `ports.ts`
still names the kinds it wires, which is what wiring is. Fully plug-and-play would mean a kind
declaring a config schema the way it declares a settings schema, and that wants its own ADR.

**T3 — `[[destinations.webdav]]`.** Argued against and settled otherwise: `destinations` is taken by
[ADR 20](../adr/0020-destinations-are-pool-state.md), and a leftover `[[destinations]]` block is
already stripped and warned about, so the name would have been swallowed by that path. `[[accounts]]`
answers the same complaint and T1 with it. **account** is now the word in `CONTEXT.md`, in the
config, in the docs and in the settings field, which used to be `profile`.

**T4 — an external DAV server for the tests.** Searched, and the fake stays. `webdav-server` is the
only maintained candidate and implements no HTTP conditional requests at all — no `If-None-Match`,
no `If-Match`, only RFC 4918's `If:` lock header — which is the whole of what these tests exercise.
Recorded in the adapter's README so it is not re-asked.

**T5 — a markdown library rather than our own.** Agreed, and it was a live bug: `sections.ts`
carried its own `TODO` naming the hazard, and a `#` inside a fenced code block ended a section, so
an append could land inside somebody's shell snippet. `insertUnder` now reads an
`mdast-util-from-markdown` parse and splices the **original string** at an offset — the tree is
never written back, because that would reformat a person's note around an insertion. Setext
headings work now too, which the regex never saw.

### Not done, and why

- The label on a settings field is still the property name (`0b`). The form argues for it and the
  composer argues the other way; worth settling, not here.
- A kind cannot declare its own config schema (`T1`). The slice above.
