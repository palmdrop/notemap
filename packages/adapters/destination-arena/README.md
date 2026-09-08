# @notemap/destination-arena

A **destination** that is an [are.na](https://www.are.na) account. A delivery arrives as a block,
connected to the channel the decision named.

A destination of this kind **is the account**. The channel is an argument, not a setting, which is
what makes it browsable and what lets a remembered place mean a channel: browsing and remembered
places are both keyed on a capability and a field, and so reach arguments and nothing else. Two
channels on one account are one destination, not two.

## The account

`[[accounts]]` with a `kind = "arena"`, a `name`, and `secretFile` or `secretEnv` — exactly one.
No base URL: `https://api.are.na` is a constant of the service and nothing in config or in a
destination's settings can move it. No username: a bearer token is who you are.

**Mint the token with `write` scope.** are.na issues `read` by default, and nothing here can tell
the difference: `GET /v3/me` does not carry the token's scope, and the OAuth exchange that does is
not something a pasted personal access token ever produces. So a read-only token passes the check
on the settings page and then fails every delivery with a `403`, whose detail says so.

## The one capability

`create`, taking a `channel`. A block is always new: there is nothing here to append into, so there
is nothing for `append` or `create-or-append` to mean.

The channel is **a slug or a numeric ID**, because v3 takes either. Browsing answers slugs, so what
a browse leaves in the field reads the way the channel's title does. A **slug does not survive a
retitle** — renaming a channel changes it — so a routing template, which fires on a tag
indefinitely and may sit for months, is better pinned to the numeric ID. A `404` at delivery says a
rename is the likely cause and points back at the browse.

## What a capture becomes

- A capture whose prose **begins with a URL on a line of its own** sends that URL as the block's
  value and the rest as its description. are.na infers Link, Image or Embed from the value, so this
  is the whole of how a pasted link becomes a link block. A URL sharing its line with prose is
  prose.
- Anything else sends the whole text as the value, which are.na makes a Text block from.
- A capture carrying **an asset** presigns an upload, streams the bytes to the address are.na names,
  and makes the block from where they landed. The caption becomes both the description and the alt
  text. Presigned URLs expire within the hour, so presigning and uploading belong to one attempt and
  a retry presigns again.
- A capture carrying **more than one asset** is refused. A block holds one thing.

Where the block came from is written into the block's own **metadata** — the item, the source, the
capture time, the `derived_from` URN, and the tags flattened into one string. The words are the ones
a note's frontmatter uses, taken from it rather than spelt again, so an item routed to a vault and to
a channel says where it came from one way. On the block rather than on the connection, so it
survives the block being moved out of the channel it landed in. It is best effort and never a dedup
mechanism: are.na does not make it queryable, and nothing here reads it back.

The routing record carries a `url` as well as a pointer, which no other kind does. It is
`https://www.are.na/block/<id>`, **composed by convention**: v3 offers no web permalink, and
`_links.self` is an API address a person cannot follow. If are.na ever changes that form, the record
carries a broken link rather than none.

## What it will not do

- **It does not promise a retry cannot duplicate.** are.na offers no conditional create and no
  idempotency key, so a `POST /v3/blocks` whose response never arrived is indistinguishable from one
  that never left. This kind's `unreachable` therefore means *could not confirm anything was
  delivered*, not *nothing was delivered*, and the window is the one between the request leaving and
  the answer coming back — most often an attempt that hit its deadline. Both file kinds do make the
  strong promise, by `EEXIST` and by `PUT If-None-Match: *`; this one cannot. A duplicate block sits
  visibly in the channel and can be deleted, which is the trade: the alternative is throwing away a
  routing decision that probably landed.
- **It does not enumerate the account.** Browsing answers one page of the channels the token's own
  user made, most recently updated first, and says when there were more. Paging the whole account is
  what are.na's own guidance asks callers not to do.
- **It never follows a redirect with the token attached.** A `3xx` is reported rather than chased.
- **It reaches nothing to describe itself or to preview.** A destination must be routable while
  are.na is asleep, which is what makes deferred delivery work; and what a block will read as is
  known without asking.

## Refused, or unreachable

| What happened | Reported as |
|---|---|
| The account is not declared, or its secret cannot be read | `unreachable` to a delivery, `unusable` to a check |
| `401` — the token was refused | `unreachable` to a delivery, `rejected` to a check |
| `403` — most often a token with `read` scope, or a channel you cannot add to | `rejected` |
| `404` — the channel is gone, most often renamed | `rejected` |
| `422` — are.na would not take the block | `rejected` |
| `408`, `429`, `5xx` — busy, rate-limited or broken | `unreachable` |
| A presigned upload refused | `unreachable` |
| The capture carries more than one asset, or no channel was named | `rejected` |
| The network could not be reached at all | `unreachable` |

Two rows are asymmetric, both for the same reason and both the WebDAV kind's: a delivery is right to
retry a refused token, one having possibly just been rotated, and right to retry an account it could
not resolve, a config file being a thing that gets fixed. A person asking *now* is owed the answer
that it will not come good on its own. An account nobody declared is **`unusable` rather than
`rejected`** there, which is the honest word: nothing was reached, so nothing refused anything.
