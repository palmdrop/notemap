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

**Item**:
One thing in the pool, with its own lifecycle, enrichment and routing decisions. Items never
merge with each other.
_Avoid_: note, memo, entry, card

**Capture**:
The original payload of an item exactly as it entered, plus the act of it entering. Editable in
place while its item is unprocessed, and fixed once it is: what left the pool is what the pool
keeps.
_Avoid_: original, raw note

**Source**:
The channel a capture came in through — a shell's typed note, its picture, a watched folder, a
polled inbox. Finer than the app that sent it, because policy is what the distinction is for: one
page may stamp two sources. Recorded on every item, along with that source's own id for what it
sent, so re-reading a source cannot duplicate. A source needs no declaration to capture; declaring
one only attaches policy.
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
_Avoid_: cursor, token, offset, page number

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
rebuild reads. Owned by the domain; where its bytes land is the driver's.
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
What a capture mechanically *is* — text, voice, link, annotation, table. Determined by what
arrived, never a judgement. Adapters declare which payload types each of their capabilities
accepts.
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
_Avoid_: event, audit entry, history

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
again without cleanup.
_Avoid_: lock, reservation, claim

**Processed**:
Said of an item that has been routed, archived or revised. It is the *decision* that processes an
item, so a routing record still pending delivery counts, and an item whose delivery is abandoned
resurfaces in the queue. Marking an item processed by hand is routing whose destination is the
user. Scrolling past an item is a **skip**, which changes nothing. Processed is also what fixes a
capture: an unprocessed item is edited in place, a processed one is revised.
_Avoid_: done, handled, cleared

### Leaving

**Destination**:
Anywhere an item can be delivered — a vault, a single file, a board, another app. Notemap does not
own the place and does not know its shape, but it does own the destination: one is pool state, with
a name a person can change and a **kind** that says how it is reached. What a routing record names,
which is why a destination is never removed once one has named it.
_Avoid_: target, sink, output

**Destination kind**:
What a destination is reached *by* — filesystem, and later a board or a published feed. Names the
adapter, and publishes the schema for the **settings** a destination of that kind must supply: a
folder, a host, a token. A kind the running code does not have makes a destination **unusable**,
which is reported rather than hiding it.
_Avoid_: type, driver, backend, provider

**Retired**:
Said of a destination that is no longer offered for new routing. Reversible, and nothing already
decided is disturbed: records keep resolving and a pending delivery still lands. It is archive's
counterpart for destinations rather than items, which is why it is not called archive.
_Avoid_: disabled, archived, deleted, inactive

**Adapter**:
The code that speaks one destination kind's or one provider's protocol. Adapters declare the
capabilities they offer. One adapter per kind, not per destination: the destination is handed to it
and it reaches back for nothing.
_Avoid_: plugin, connector, integration

**Capability**:
One thing an adapter can do — create a note, append into an existing file, post to a board
column. Names itself, says which payload types it accepts, and carries a schema for the
**arguments** a delivery must supply: where it goes, and anything else that shapes it, such as a
template or a format. Core matches and refuses; it holds no list of its own, so a new kind of
destination needs no change in core.
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
is the item.
_Avoid_: push, transfer, upload

**Routing record**:
One delivery, and the whole of what notemap remembers about it: destination, capability, what the
delivery targeted there, the time the decision was made, and a best-effort pointer to where the item
landed. A stale pointer
is acceptable. The target is remembered rather than consumed, because a delivery that has not landed
is attempted again from the record alone. A record begins as a
**reservation** the moment the decision is made and joins the append-only log when its delivery
lands; a reservation whose delivery is abandoned or cancelled is removed, since nothing happened to
record. So a record that is not pending means bytes reached somewhere. Where a destination
reshaped the item on its way out, the record may also name **what was delivered**, so the pool can
answer what it sent and not only where.
_Avoid_: routing status, delivery flag

**Routing summary**:
What an item says about its own routing without being asked for its records: how many there are,
how many are still pending, and the distinct places they name. Derived from the records, carried by
every read that answers items, and absent where there are none — so a surface reading a page can
say an item was routed and where, and reads the records themselves only when someone opens one.
_Avoid_: routing status, routing state, processed flag

**Archive**:
To hide an item from the queue without deleting it. Presented in the UI as delete when the user
means "this is noise"; the item stays in the feed and stays processable.
_Avoid_: delete, dismiss, trash

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

**Refused**:
Said of an outbox operation the pool answered no to. Terminal without a person: waiting will not
drain it, and the client's cache is left holding something the pool never accepted, so it is shown
and dismissed rather than retried.
_Avoid_: failed, error, rejected (reserved for suggestions)
