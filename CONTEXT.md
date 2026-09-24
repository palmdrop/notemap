# Notemap

Notemap captures anything worth keeping into one pool, enriches it without altering it, and
routes it out to wherever it actually lives. It is a conveyor belt, not an archive: items are
supposed to leave.

## Language

### The store

**Pool**:
The complete set of items notemap holds. Owned outright by notemap and reachable only through
its API.
_Avoid_: store, inbox, database

**Pool identity**:
Which pool this is: minted when the pool is created, stable for as long as it exists, and opaque —
it names a pool without describing one. A rebuild makes a new pool and so takes a new identity,
which is how a client that cached one can tell that everything it holds describes somewhere else.
_Avoid_: pool id, instance id, server id, fingerprint

**Pool setting**:
A named value true of the pool rather than of any item, destination or template — changed by a
person while using notemap, on the same footing as a destination, and never something an install
sets. The known ones are a closed list in code, one entry today: `unfurl`, a boolean defaulting to
on. Unset reads as its default, and every change is an ordinary write, mirrored and logged like any
other pool state. Named for what it differs from: a destination's **settings** are the values a
kind's schema asks for and belong to one destination; a reading **preference** — the palette, the
order control — lives on the device and carries no privacy cost, where a pool setting wants one
answer for the whole pool and not one per device.
_Avoid_: setting on its own, configuration (which is what an install is), preference, option, flag,
knob

**Item**:
One thing in the pool, with its own lifecycle, enrichment and routing decisions. Items never
merge with each other.
_Avoid_: note, memo, entry, card

**Capture**:
The original payload of an item exactly as it entered, plus the act of it entering. Editable in
place while its item is unprocessed, and fixed once it is: what left the pool is what the pool
keeps.
_Avoid_: original, raw note

**Draft**:
What a capture box holds before its capture commits — the words and the tags, kept across a
reload, and the picture, kept in memory and so only across the box being drawn again. Kept by
the shell, on the device, and never sent: the pool has no draft. Cleared when the capture
commits, kept when it fails.
_Avoid_: unsaved, pending *(the outbox's word, for a capture that has committed and not landed)*

**Source**:
The channel a capture came in through — a shell's typed note, its picture, a watched folder, a
polled inbox. Finer than the app that sent it, because policy is what the distinction is for: one
page may stamp two sources. Recorded on every item, along with that source's own id for what it
sent, so re-reading a source cannot duplicate. A source is **discovered**, never declared: the
sources that exist are every one the pool has an item from, with how much of it and when it last
captured, read from the items themselves (*amended 2026-09-07*). *Amended 2026-09-09*: the
configuration block that could have carried policy for one is gone, nothing having read it, so a
source carries none until enrichment gives it some.
_Avoid_: channel, origin, importer, client

**Feed**:
The pool read chronologically and completely. Accumulates forever; its job is that nothing is
ever lost.
_Avoid_: timeline, stream, history

**Queue**:
The pool read as the unprocessed items, ordered by capture time. A view, not a place. Its job is
to drain to zero. Oldest first is the default and the reason it is a queue, but which end a reader
starts from is the reader's, as it is for the feed. Editing never moves an item within it, because
the person editing is already looking at it; a revision resurfaces on its own, being a new capture.
_Avoid_: inbox, backlog, todo list

**Position**:
The sort-key fields of the last row a paginated read handed out, named in domain terms. Each
surface names its own: the feed and the queue both continue from a capture time and an id, the
abandoned surface from the time it was given up on. A parameter of a read, never stored, and never
the frontend's idea of how far processing has got, which notemap's core does not hold. A position
belongs to the ordering it names rather than to the surface that issued it.
_Avoid_: cursor, offset, page number. Not "token" either, though the word is taken: an
**access token** is a credential and nothing to do with a place in a list.

**Revision**:
An ordinary capture, made by editing a processed item, carrying its own capture time, source and
id plus a link to what it was made from. The link is a trace, not a replacement: the item it came
from was delivered or archived and stays exactly as it was. One item may be revised more than once,
and the revisions are independent of each other.
_Avoid_: version, update, edit

**Revised into**:
Said of an item that one or more revisions were made from. Derived from the revision links, never
stored. It processes the item, which is why a further edit appends another revision rather than
changing it.
_Avoid_: superseded, outdated, replaced, stale

**Mirror**:
The complete plain-file copy of the pool that notemap writes and never reads, except to rebuild a
lost pool. Automatic and complete, which is what distinguishes it from a **destination**.
_Avoid_: backup, export, sync folder

**Mirror record**:
One item's complete durable state as the mirror carries it — payload, classification, assets,
artifacts and their corrections, routing records. The unit of mirroring, and the only thing a
rebuild reads. Owned by the domain; where its bytes land is the driver's. *Amended 2026-09-24*: the
unit is not only an item's. A destination, a template and a pool setting each get one too, complete
and durable on the same terms — everything a rebuild needs to restore that thing, and nothing else.
_Avoid_: sidecar, state file, document, snapshot

**Rendering**:
The readable file the mirror writes beside a record, for a person who no longer has notemap.
Nothing ever parses it, which is precisely what lets it be lossy, opinionated and pretty.
_Avoid_: export, markdown copy, view

**Rebuild**:
Reconstructing a pool from a mirror and its assets. Not an operation on a pool but the act of
making one, so a live pool is never given the means to read the mirror. The rebuilt pool carries a
new identity and no history.
_Avoid_: restore, import, recovery

**Verify** / **repair**:
Checking that the mirror matches the pool, and making it match. Verify reports; repair only
enqueues work, so every byte the mirror receives still arrives by the one write path. Neither ever
changes the pool: the pool is authoritative and the mirror is the copy.
_Avoid_: sync, reconcile, fsck

**Asset**:
A named reference to media belonging to a capture — audio, image, page snapshot. Carries the
filename exactly as it was uploaded and points at the blob holding the bytes. Uploading the same
bytes twice under two names produces two assets. Its id is minted by whoever uploads it, as a
capture's is, so an asset has an identity before the pool holds its bytes. Pool state, held beside
the item references that count it, so an asset an item still references cannot be released.
**To attach** is the act of naming one on a capture, and a capture that carries one has an
attachment — the word is the gesture and what came of it, never the asset itself, which is what the
Avoid list is about.
_Avoid_: attachment *for the asset*, media file

**Blob**:
The bytes an asset points at, stored once and addressed by their SHA-256. Named for a machine,
shared by the pool and the mirror, and freed when the last asset referencing it goes. The layer
where deduplication happens; a filename never reaches it, and neither does the store beneath it,
which knows hashes and bytes and nothing else.
_Avoid_: object, binary, content

**Sweep**:
The periodic release of assets no item ever referenced, together with the blobs that lose their
last asset. Its subject is the upload whose capture never arrived, so it waits out a grace window
first: to a sweep running at the wrong instant, "referenced" and "about to be referenced" look
identical. Purge is what releases an asset whose items *went*; the two never overlap. It reaches
blobs only through the assets that name one, so bytes no asset ever named are deep verify's.
_Avoid_: garbage collection, cleanup, prune, reap

### Processing

**Classification**:
Deciding what an item is and whose it is. Cheap, reversible, and does not remove the item from the
queue. Its only axis is tags.
_Avoid_: tagging, triage, labelling

**Tag**:
A free-text label on an item, and the whole of classification. Namespacing is convention, not
structure: `project/fiction-a`, `kind/quote`. There is no separate item type and no project entity
— both are tags.
_Avoid_: label, category, keyword, folder

**Tags in use**:
Every tag the pool carries, each with the number of items carrying it. A reading of what
classification has produced, never a vocabulary: it is what a person is offered while they type,
and a tag no item carries simply is not in it. An item that was revised still counts: it is a real
item still carrying its tags, and the revision that copied them is another one.
_Avoid_: tag list, taxonomy, vocabulary, autocomplete

**Payload type**:
What a capture mechanically *is*. Determined by what arrived, never a judgement. Adapters declare
which payload types each of their capabilities accepts. There is one, **note**: prose with any
number of attachments, either half of which may be missing. Which types exist is core's, not a
deployment's — a host is handed the list rather than writing one.

A second type exists **only when `content` needs a different schema**. `link` qualifies, carrying
a `{ url }` nothing else validates; `table` qualifies. **Voice does not**: a recording's audio is
an **asset** and its transcript an **artifact**, so a `voice` type would be `note`'s schema under
another name and nothing could tell the two apart by looking. What a capture is *about* is its
**source** and its **tags**; what an attachment is, is its media type.

`note` names a payload's shape. It is still the wrong word for an item, as **Item** says.
_Avoid_: type, kind, format

**Enrichment**:
One automated unit of work that produces material *beside* a capture without changing it: a
transcript, a suggested tag, a guessed destination, an embedding. Each declares what it needs and
runs once those needs are met, so enrichments are unordered and may run concurrently. Counts as a
noun for both the unit and its per-item state.
_Avoid_: processing, AI, analysis, step, stage, pipeline

**Suggestion**:
A single advisory output of enrichment, awaiting a human decision, and meaningless until it gets
one. Resolves to accepted or rejected; both are kept.
_Avoid_: recommendation, prediction, guess

**Artifact**:
A durable enrichment output that stands on its own and is never accepted or rejected — a
transcript, an embedding. It is not a proposal. Correcting one is not an edit of the capture.
_Avoid_: result, output, derived data

**Accept** / **Reject**:
What a person does to a suggestion. Accepting writes real state that records which agent the
suggestion came from; rejecting is kept as signal about the suggester. Both are kept.
_Avoid_: ratify, approve, confirm, apply

**Decision**:
A suggestion's resolution — accepted or rejected. A suggestion that has neither is
**undecided**. The collective noun only; the actions are always named directly.
_Avoid_: ratification, verdict, outcome

**Provider**:
A configured external capability that performs one enrichment — transcription, formatting,
embedding. Reached through an adapter.
_Avoid_: backend, engine, service

**Agent**:
Whoever or whatever did something: the person, a named provider, an intake source, or notemap
itself. Recorded on every tag, artifact and suggestion so that "which of these did a model give
me?" stays answerable. Notemap is its own agent only for work it drives rather than performs on
anyone's behalf — a mirror write that failed is attributable to nobody else.
_Avoid_: author, actor, user, system

**Action**:
One entry in the append-only log of everything that changed state — what happened, when, by
which agent, to what. Read by a human tracing something; pool state is never derived from it.
_Avoid_: event, audit entry

**History**:
The action log narrowed to one item: everything that happened to it, in order. The shell's word
for the way there from the item; the log itself is still the log, and one entry is still an
action.
_Avoid_: only this, timeline, activity

**Daemon log**:
What the daemon says on stdout as it runs — every action as core commits it, every refusal and
failure, the facts it started with — one levelled line per event, for the person reading
`docker logs`. Not the action log, which is pool state the daemon merely echoes: nothing reads
the daemon log back, and a line it dropped is not a fact the pool lost.
_Avoid_: the log *on its own, which is the action log*, console output, server logs

**Job**:
One unit of claimable work core holds but never runs — an enrichment to perform, a mirror record
to write, a purged item's mirror files to remove, a delivery to attempt. Hosts claim jobs and drive
them; core only records that there is something to do. A job's **subject** says what kind of thing
it is about as well as which one, because not every kind of work is about an item — and the thing
it names may since have been purged.
_Avoid_: task, queue entry, work item

**Lease**:
A time-limited exclusive claim on a job. It expires by being past its time when someone next
claims, not by anything reaping it, which is what lets a crashed host's work become available
again without cleanup. A client's outbox uses the same shape one layer out: `sending` is a lease
on an operation, held `until` a time, so two clients over one store send it once between them.
_Avoid_: lock, reservation, claim

**Handover**:
An outbox's in-memory hold on an operation, taken the moment a drain schedules it and released
when the attempt settles, so a second drain in the same process cannot send it again. It does not
cross a process boundary; that is what a lease is for.
_Avoid_: claim, inflight

**Processed**:
Said of an item that has been routed, archived or revised. It is the *decision* that processes an
item, so a routing record still pending delivery counts, and an item whose delivery is abandoned
resurfaces in the queue. Marking an item processed by hand is routing whose destination is the
user, and is presented in the UI as **manual**. Scrolling past an item is a **skip**, which changes
nothing. Processed is also what fixes a capture: an unprocessed item is edited in place, a processed
one is revised.
_Avoid_: done as a name for the state, handled, cleared. **Done** is spent on the gesture instead —
it is what the button that ends the `manual` step says, a verb beside `route` rather than a word for
what an item now is.

### Leaving

**Destination**:
Anywhere an item can be delivered — a vault, a single file, a board, another app. Notemap does not
own the place and does not know its shape, but it does own the destination: one is pool state, with
a name a person can change and a **kind** that says how it is reached. What a routing record names,
which is why a destination is never removed once one has named it. Never itself called an
**output** — that is what a delivery to one produces.
_Avoid_: target, sink

**Destination kind**:
What a destination is reached *by* — filesystem, and later a board or a published feed. Names the
adapter, and publishes the schema for the **settings** a destination of that kind must supply: a
folder, a host, a token. A kind the running code does not have makes a destination **unusable**,
which is reported rather than hiding it.
_Avoid_: type, driver, backend, provider

**Retired**:
Said of a destination that is no longer offered for new routing. Reversible, and nothing already
decided is disturbed: records keep resolving and a pending delivery still lands. It is archive's
counterpart for destinations rather than items, which is why it is not called archive. Presented in
the settings UI as **disabled** (`disable` / `enable`), on the same terms `archive` is presented as
`discard` — the wire and this term are untouched; the shell alone says it differently.
_Avoid_: disabled, archived, deleted, inactive

**Adapter**:
The code that speaks one destination kind's or one provider's protocol. Adapters declare the
capabilities they offer. One adapter per kind, not per destination: the destination is handed to it
and it reaches back for nothing.
_Avoid_: plugin, connector, integration

**Capability**:
One thing an adapter can do — **create** something that was not there, **append** into something
that was, or decide between the two at delivery. Named in words no kind owns, so a vault's note and
a board's block are one capability rather than two; whether `create` refuses a name already taken is
the kind's own promise and not the capability's. Says which payload types it accepts, and carries a
schema for the **arguments** a delivery must supply: where it goes, and anything else that shapes
it, such as a template or a format. It may also **annotate** a field — that this one can be browsed,
that this one is a `/`-separated path — which is how anything that needs to know more than the shape
asks the capability rather than knowing it by name. Core matches and refuses; it holds no list of
its own, so a new kind of destination needs no change in core.
_Avoid_: verb, action, method, operation

**Route**:
To decide that an item belongs at a destination. Non-destructive: the item stays in the feed, and
an item may be routed more than once, to more than one place. The decision is always a person's,
and is complete the moment it is made — carrying it out is a **delivery**, which happens after.
_Avoid_: export, publish, send, file

**Delivery**:
One attempt to place an item at a destination through one of its capabilities. Everything durable
about the item is handed to the adapter, which reaches back for nothing. A delivery is **pending**
until it lands, and then either delivered or abandoned; a person may cancel one that is still
pending. Reshaping the item into the destination's dialect happens here, inside the delivery, and
never to the capture — so one item reaches several destinations in several forms and none of them
is the item. A delivery may also carry **its own words** in place of the capture's, a **rewrite**,
which is the person's half of the same arrangement.
_Avoid_: push, transfer, upload

**Rewrite**:
The words one delivery carries in place of the capture's, supplied by a person when the decision is
made and held on the **routing record** — so one capture reaches two destinations in two wordings
and each record says which it sent. Checked against the item's payload type exactly as a capture is,
and carried by the reservation, so a delivery attempted hours later replays the words it was decided
with. It rewrites the **delivery** and never the capture: rewriting the capture is what **editing**
is, permanent and for every later route, and it is what routing must never do. The words are the
input to a **conversion**, not a replacement for one — the destination still shapes them — and the
capture's assets are untouched by one.
_Avoid_: amendment, revision, edit, conversion. Each is a different act already glossed here:
amendment and revision are what an edit makes of the capture, and a conversion is the destination's.

**Conversion**:
A destination reshaping a copy of an item on its way out — into a list entry, a front-matter block,
a dialect of markdown that is not the item's. It happens inside the **delivery**, never to the
capture, and what it produced is kept as the **output**. Reshapes the **rewrite** where the delivery
carries one, and the capture's own words otherwise: what is converted is what was sent, and the
destination owns the shape either way. Distinct from a **routing template**, which says where an
item goes and never what shape it arrives in.
_Avoid_: template, transform, formatting. Template names the saved routing decision below.

**Output**:
The content a delivery produced — what the destination actually wrote, in the destination's own
dialect rather than the item's, and made from the **rewrite** where the delivery carried one.
Optional, because a destination posting to an API may have nothing
meaningful to keep, and named by the **routing record** rather than by the item, since two
destinations produce two outputs from one item. Carries a media type and may carry a **note**: free
prose about what could not be carried, which nothing parses. A destination may also be asked for
one **before** anything is committed, which is a **preview** — indicative and never binding, since
the delivery converts again when it runs.
_Avoid_: rendition, artifact, receipt. Rendition collides with **Rendering**, which is the mirror's
readable file; an **artifact** is an enrichment's output and belongs to an item; a receipt would
imply the destination acknowledged something, which nothing here does.

**Routing record**:
One delivery, and the whole of what notemap remembers about it: destination, capability, the
arguments the capability was given, the time the decision was made, and a best-effort pointer to
where the item landed. A stale pointer
is acceptable. The arguments are remembered rather than consumed, because a delivery that has not
landed is attempted again from the record alone, and a **rewrite** is remembered on the same terms
where the decision carried one. A record begins as a
**reservation** the moment the decision is made and joins the append-only log when its delivery
lands; a reservation whose delivery is abandoned or cancelled is removed, since nothing happened to
record. So a record that is not pending means bytes reached somewhere. Where a destination reshaped
the item on its way out, the record may also name the **output**, so the pool can answer what it
sent and not only where. Beside the pointer it may carry a **URL**, where the destination can offer
a link to the same place; neither kind that writes files ever does — a path on the daemon's host is
nowhere a phone can follow, and a WebDAV address is the daemon's credential rather than a link
anyone else holds. Where the decision came from a **routing template**, the record names it, and
says whether a **trigger tag** made it — a decision a person made with the item in front of them and
one a tag made are the same delivery and not the same act, and only the second gives its tag back
where nothing landed.
_Avoid_: routing status, delivery flag

**Routing template**:
A routing decision, saved: a destination, a capability, the arguments as **patterns**, and how its
folder is treated. Pool state, mirrored, and reachable from every device, which a shell remembering
your last route never was. Applying one is the decision itself, made in one gesture rather than a
smaller one — from the composer, or by its **trigger tag** arriving. Its patterns are expanded when
the decision is made, so the record it produces names a place a person can read. Says where an item
goes and never what shape it arrives in, which is **conversion**.
_Avoid_: rule, preset, macro. A rule is the conditional thing this deliberately is not; the other
two say nothing about routing.

**Trigger tag**:
The tag a routing template declares, under the reserved `route/` namespace, whose arrival on an item
applies the template. Declared rather than derived from the name, so renaming a template disarms no
tag already written, and unique across templates. Fires on the **tagging** and never on the tag
being present, so a revision carrying one fires nothing. It stays on a delivered item, where it
reads as why the item went where it went, and comes off again where the reservation it made was
cancelled or abandoned. It is the pool's and not the item's, so a delivery leaves every `route/` tag
behind unless asked to send them. A `route/` tag naming no template is an ordinary tag that fires
nothing.
_Avoid_: hotkey tag, magic tag, action tag

**Routing summary**:
What an item says about its own routing without being asked for its records: how many there are,
how many are still pending, and the distinct places they name. Derived from the records, carried by
every read that answers items, and absent where there are none — so a surface reading a page can
say an item was routed and where, and reads the records themselves only when someone opens one.
_Avoid_: routing status, routing state, processed flag

**Remembered place**:
One value a capability's argument field has already held on one destination, with how often the
routing records used it and when the last of them was. Answered by the pool from its own records,
never by going and looking, so it is offered while the destination itself is out of reach — which
is what distinguishes it from a **candidate**, the destination's own answer about what a field
could hold. Per destination, because a place in one vault means nothing in another. Facts and not
an order: whatever draws them ranks them. A remembered place the destination's listing does not
hold is **gone**, which is said rather than silently re-created.
_Avoid_: recent, history, favourite, suggestion

**Archive**:
To hide an item from the queue without deleting it. Presented in the UI as **discard**, the word
for meaning "this is noise"; the item stays in the feed and stays processable. Taking it back is
**undiscard** in the UI, and `unarchive` on the wire and in the log's kinds. The word is spent
here rather than on **purge**, which is what a reader would otherwise expect it to mean: purge is
the irreversible one and has no UI, so it will want a word of its own when it gets one.
_Avoid_: delete, dismiss, trash, unarchive (in the UI)

**Purge**:
To irreversibly remove one item, its assets and its enrichment. Revisions made from it are items in
their own right and stay, their link left pointing at a tombstone. The one destructive operation,
and the one exception to the append-only rule.
_Avoid_: hard delete, wipe, erase

### The client

**Client**:
A satellite of one pool, holding an outbox of pending mutations and a cache of recent items, and
reaching the pool only through `/v1`. One pool, many clients; the shared client logic is the same
across them.
_Avoid_: app, frontend, device

**Shell**:
The platform wrapper a client runs inside — the web SPA, the Tauri desktop or mobile build. Only
the shell differs between platforms; the client it wraps does not.
_Avoid_: platform, wrapper, host

**Surface**:
One of the ways a client presents the pool — capture, the feed, the queue, an item. A projection
with its own reading and its own position, not a screen: a shell may draw two surfaces on one
screen, or one surface across several.
_Avoid_: screen, page, view, tab

**Command**:
A deed a person can take, published by whatever surface is on screen rather than registered
anywhere — an id a binding names, a word a person reads, the deed itself, and why it cannot be
taken where it cannot. Closes over whatever only the surface holds, such as the selected row, which
is why a surface publishes its own rather than one list holding every command there is.
_Avoid_: action, shortcut, hotkey, keybinding

**Binding**:
The chord one command answers to, held as `id → chord` in one table the dispatcher reads to resolve
a keydown, and a button reads to draw what a key would do. The other direction — what chord is this
— is a display question, answered by looking a chord up rather than by the table holding it that
way round.
_Avoid_: keybinding, shortcut, hotkey

**Hydration**:
Reading a client's own store back into memory when it starts, before anything is allowed to touch
what was read. Pending operations are not re-applied: what they changed was written to the store
along with them.
_Avoid_: rehydration, restore, boot, warm-up, sync

**Cache**:
The items a client holds, and what its surfaces are drawn from until the pool answers for one. A
copy, never an authority: everything in it can be re-read, so it is dropped without ceremony when
it describes a pool that is no longer there. What the client can see is unprocessed is its working
set and is kept whatever its size; the rest is history and is capped.
_Avoid_: local store, offline copy, snapshot, mirror

**Outbox**:
A client's ordered set of pending mutations, held locally and drained to the pool — at once when
it can reach it, on reconnect when it cannot. Carries captures and classification, never
deliveries: a client that cannot reach the pool cannot route.
_Avoid_: sync queue, pending queue, queue

**Pending**:
Said of an outbox operation applied to a client's cache and not yet drained to the pool. The
ordinary state of every mutation and a self-healing one — it drains when the pool is next
reachable — so it is never a failure and is never dressed as one. An **item** is drawn as pending
when an operation about it is: the client answers those as the **undrained** set, which is every
operation that is not refused and so is wider than the one operation state named `pending`.
_Avoid_: unsynced, unsaved, queued, offline

**Watched**:
Said of a client whose surfaces someone is looking at — a visible page, a foregrounded app. What a
shell tells its client, and what decides whether the reachability probe runs: an unwatched client
asks the pool nothing and asks once when it is watched again, so a mark that is right without being
asked costs nothing while nobody is reading it.
_Avoid_: visible, focused, active, foreground

**Notice**:
Something the shell says in its own voice, in the corner, about work that has already happened, to
somebody who did not ask. A confirmation goes on its own; anything a person may have to act on holds
until they clear it. Not an **action**, which is the pool's durable record of the same event and is
what a notice is derived from; not a **refusal**, which is the one notice a person must clear before
the client stops holding something the pool never took.
_Avoid_: toast, notification, alert, banner, message

**Refused**:
Said of an outbox operation the pool answered no to. Terminal without a person: waiting will not
drain it, and the client's cache is left holding something the pool never accepted, so it is shown
and dismissed rather than retried.
_Avoid_: failed, error, rejected (reserved for suggestions)

### Reaching out

**Account**:
A login the daemon holds on **another** system, so that a destination can deliver to it — a
Nextcloud, an are.na, and whatever comes after. Either declared in the daemon's config under
`[[accounts]]`, or **stored** by the daemon in `auth.db`, set from the settings page. One per kind
and name, and resolved as one thing when a delivery needs it. Where both declare the same kind and
name, the stored one is used whole and the config one is **shadowed**. What an account of a given
kind must carry besides its secret is that kind's own — an address and a username for one, nothing
for another — declared by its adapter. The secret, and where a config account reads it from, are the
host's. Never in a destination's settings, which are pool state: a destination names an account and
a place within it, and has nowhere to put an address or a secret
([ADR 28](docs/adr/0028-a-remote-destination-names-a-credential-profile-not-a-url.md),
[ADR 40](docs/adr/0040-a-destination-kind-declares-the-shape-of-its-own-account.md),
[ADR 49](docs/adr/0049-an-account-may-be-held-by-the-daemon.md)).

The one word in this glossary that points outward. The daemon's own **credential** is not an
account and is never called one, and neither is an **access token**, which notemap issues rather
than holds; an account is never notemap's, and belongs to a server somebody else's software is
running.
_Avoid_: profile, connection, endpoint, integration, remote

**Relay**:
A program *outside* notemap that reads someone else's system and captures what it finds into the
pool over `/v1`, carrying an **access token** like anything else that is not a browser. Deliberately
not an **adapter**: a destination is in-process because core owns the decision, the durable record,
retry and leases, and intake owns none of those — the recovery strategy for a failed poll is to
poll again. So a relay holds nothing. It re-reads what it watches each poll and lets the pool's own
dedup make that harmless — everything, or as far as the first page the pool already has, where an
upstream asks not to be read in full every time — which is why it needs no job, no lease and no
outbox
([ADR 39](docs/adr/0039-a-relay-is-outside-notemap-and-reaches-v1-like-anything-else.md)). There are
two: `apps/relay-memos`, which reads a Memos server, and `apps/relay-arena`, which reads a watched
are.na channel.
_Avoid_: importer, connector, sync agent, ingester, adapter (for this)

**Unfurl**:
What a link in a note points at, read by the daemon on request — a title, a line of description, a
picture's address and the site's name, from the page's Open Graph tags or its `<title>` — and the
act of reading it. Indicative, like a **preview**, and never binding: held in the daemon's memory
for a while and then forgotten, never pool state, never mirrored, never an action. "Nothing could be
read" is an ordinary unfurl. Like a **relay** it points at somebody else's server, so it is guarded:
only a public address is ever fetched. Whether the daemon unfurls at all is the **pool setting**
`unfurl`, and while it is off nothing is asked
([ADR 51](docs/adr/0051-an-unfurl-is-the-daemons-and-is-not-enrichment.md)). Not a **preview**,
which is a destination's output before commit, and not enrichment, which writes to the pool.
_Avoid_: preview (for this), enrichment, metadata, embed, oEmbed, scrape, link preview

### The door

**Credential**:
The one username and password a daemon holds, or nothing. Stored beside the pool and never in it,
so a rebuild from the mirror restores no way in. Setting one closes the door on the next request;
a daemon with none asks for nothing and lets every request through. There is exactly one, and it
belongs to the person running the daemon — there is nothing to register. It is set from the command
line, or from the environment on a daemon that holds none, which never replaces one that is already
there. Not an **account**, which in notemap is always somewhere *else's*: see below.
_Avoid_: account (for this), user, login (as a noun), identity

**Session**:
What a person holds after signing in: a secret in an `HttpOnly` cookie, and a row the daemon keeps
the digest of. Expires on its own and ends when someone signs out, when the password is set, or
when every session is ended at once. Belongs to a browser; anything else carries an access token
instead.
_Avoid_: login, cookie, ticket, JWT

**Access token**:
A credential issued to something that is not a browser — a script, a headless client, a machine
with nobody at it. Named when it is minted so it can be told apart later, shown exactly once, kept
only as a digest, and revoked one at a time. Reaches everything a session does except the routes
that manage access tokens and end sessions, so a leaked one cannot mint its replacement or hide
itself.
_Avoid_: API key, PAT, bearer, secret

**Signed in**:
Said of a request the daemon knows — by session or by access token. Not the same as *permitted*:
nothing in notemap answers what a signed-in request may do, because there is one person holding
every credential. A request that is not signed in is **unauthenticated**, and is refused rather
than redirected.
_Avoid_: authenticated (in prose about people), logged in, authorized

**Open**:
Said of a daemon nobody has set a credential on, where every request is let through, and of the few
routes that answer without one on a daemon that has: signing in, asking who you are, liveness, and
the pages the daemon serves. Open is a state to be told about, not a mode to be relied on.
_Avoid_: public, anonymous, unprotected
