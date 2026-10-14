# @notemap/output-markdown

What turning a `Delivery` into a markdown note is, with no opinion about where the note goes. A
filesystem vault and a WebDAV vault must write the same note, and the way to guarantee that is for
there to be one piece of code that writes it.

It holds the renderers and the fixed frontmatter, the two capabilities that place a note in a
folder, the derived filename, `insertUnder`, and the two name helpers every destination that has
files needs. Nothing in here does any I/O, which is what lets a caller ask what *would* be written
as cheaply as it writes it.

## Rendering

Renderers are wired by the host, by payload type, exactly as the mirror's are — which payload types
exist is not an adapter's business. A payload type with no renderer still gets a readable file: the
provenance frontmatter, its content as a fenced JSON block, and a link to each asset that landed
beside it.

The renderer is handed the directory the note is going into and the name each asset ended up under,
because a name may have been suffixed to avoid taking a file that was already there. Link to one
with `linkTo`: an uploaded filename may carry spaces, and a bare CommonMark destination ends at the
first one.

This is not the Obsidian dialect. It emits plain CommonMark: no `[[wikilinks]]`, no `![[embeds]]`,
no `.canvas`.

## Frontmatter

The fixed keys carry the item id, the capture source, the payload type, the capture and content
times, the tags, and `derived_from` as a `urn:commons:item:` URI — which is what lets a note that
has left notemap still be traced back to the capture it came from. A renderer may add keys of its
own and may not shadow one of these.

`KEYS` is keyed by `Delivery`, so a field added to the domain fails to compile until somebody
decides where it goes.

## The two capabilities

`create` takes `{ directory, filename? }` and `append` takes `{ path, heading? }`. All three also
take `frontmatter` — `full` or `none` — which overrides the destination's own setting for one
delivery; absent inherits it, and an absent setting is `none`.

All three also take `conversion`: `block`, the note as it is and the default; `list-item`; or
`task`. The two list shapes write one item: its line is the first line of the first prose the
rendering holds, the rest goes beneath it as indented continuation with no blank lines, the
hashtags go at the end of the item's line, and no frontmatter is written. `frontmatter` is offered
only while `conversion` is `block`, and `conversion` comes before it in the schema because a form
judges a condition against the fields ahead of it. A value no kind publishes is a
`RenderingFailed`, so the delivery is rejected.
They live here rather than in either adapter because two kinds doing the same thing under different
words would make every rule and every composer choice kind-specific for no gain — and two copies of
one schema are two things to keep in step.

`browsable` says whether the field naming the place carries `x-notemap-candidates`. A kind that can
enumerate what it holds says yes and answers `candidates()`; one that cannot says no, and the
composer draws no browse button for an answer it would refuse.

## Naming

`oneSegment` flattens a name that was never promised to be one — an uploaded filename may be
`../../authorized_keys`. Letters and digits of any script survive, because transliterating would be
notemap deciding somebody's language is wrong.

`alternatives` yields `name`, `name-1`, `name-2`, keeping the extension. It is how a name that is
taken is answered without overwriting whoever took it; what "taken" means is the adapter's, since
only it can ask.

`deriveFilename` is what to call a note nobody named. It is **weak, and knowingly**: the domain has
no title, so it is the first line of the longest string the payload carries, sanitised and
truncated, and the item id when there is no prose at all.
