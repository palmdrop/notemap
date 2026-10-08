# 56. The pool measures a picture from its bytes

**Date**: 2026-10-08
**Status**: Accepted. Adds to the asset [ADR 16](0016-the-asset-registry-is-pool-state.md) made pool
state; [ADR 22](0022-the-uploader-mints-the-asset-id.md)'s conflict check is unchanged.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

The shell draws an item's first two pictures above its words, bounded so a tall one cannot swallow
the row. Nothing knows a picture's size until the browser has loaded it, so every row carrying one
is drawn without it and grows when it arrives. That shift is what the shell's motion rules forbid
everywhere else, and on a register that a person walks with `j`/`k` it moves the row they are
looking at. An unfurl solved the same problem with a fixed square, which works because an unfurl's
picture is a thumbnail; a capture's picture is the content, and its proportions are part of it.

Where does a picture's size come from before its bytes do?

---

## Decision drivers

- **Every source captures pictures.** The web shell, the Raycast extension and the are.na relay all
  upload; the relay is where most pictures come from. An answer only one uploader gives is no
  answer for the rest.
- **What the pool serves it can vouch for.** A filename and a media type are served back as they
  were told, and the conflict check exists because of it. A size that only drives layout is not
  worth a new way for two uploads to disagree.
- **Proportions, not a frame.** A picture should take the room it will fill, no more.
- **A photograph is drawn upright.** A phone stores a portrait photo as landscape with an EXIF
  orientation, and the browser turns it. A size read without the orientation is wrong for exactly
  the pictures most often captured.

---

## Considered options

1. **The pool reads the size from the bytes as it stores them**, with `image-size`.
2. **The uploader says the size** beside the filename and media type.
3. **A fixed frame in the shell**, as an unfurl's square is.
4. **The pool reads the size with a parser of our own.**

---

## Decision outcome

**Option 1.** When an asset whose media type is `image/*` is stored, core copies the first 512 KiB
aside as the bytes pass to the blob store and reads its size from them, a JPEG's EXIF orientation
applied, so the size is the picture's as it is drawn. A HEIC or an AVIF is not measured: it keeps
its turn in a box of its own, which `image-size` does not apply, and a portrait photograph would
be answered on its side. The asset carries an optional `dimensions: { width, height }`, absent
where the bytes could not say. The host measures the pictures stored without dimensions once as it
starts, a page at a time; one whose bytes cannot say, or cannot be read, is passed over and asked
again on the next start rather than marked, since a better reader may manage it. That costs a
512 KiB read per such picture at every start, which is nothing at a person's scale. An upload
repeated for an asset held without dimensions measures it then. The shell sets `width` and `height` on the `<img>`, so the browser keeps the room at the
picture's proportions, and the shell's own bounds still decide how much room that is.

- **Not compared by the conflict check.** Equal blobs agree on their dimensions, as they agree on
  their size in bytes.
- **Not carried by the mirror.** They are read from the blob the mirror already holds, so the
  record leaves them out and a rebuild measures again rather than trusting one.
- **Measuring a picture changes nothing an item is.** No item is touched and no action is logged; a
  client reading the item again sees them.

### Consequences

- `@notemap/core` takes its first dependency that is not a utility: `image-size`, which has none of
  its own.
- A picture stored with the pool unreachable is drawn from the client's held bytes, which carry no
  dimensions, so it shifts once as before; it gains them when it drains.
- 512 KiB is a guess at where a JPEG's size can be found behind its metadata. A photograph whose
  thumbnail, profile and XMP run past it is stored unmeasured, and drawn as it was before.

---

## Pros and cons of the options

### Option 1: the pool reads the size, with `image-size`

- Good: every source's pictures are measured, and so are the ones already held.
- Good: JPEG's EXIF orientation, and every common format's size, come with it. The turn a HEIC or
  an AVIF keeps in its own box does not, so those are left unmeasured.
- Bad: a dependency in core, and one more read of each picture's head at store time.

### Option 2: the uploader says the size

- Good: no parser anywhere; the browser already knows.
- Bad: every uploader but the web shell sends nothing, and the relays are where pictures come from.
- Bad: a size the pool serves without being able to vouch for it, and a re-upload that disagrees
  needs a rule the conflict check does not have.

### Option 3: a fixed frame in the shell

- Good: no change outside the shell.
- Bad: a small or a wide picture leaves the frame mostly empty, which is a different way of taking
  more room than it needs.

### Option 4: a parser of our own

- Good: no dependency.
- Bad: EXIF orientation, and every format beyond PNG, JPEG, GIF and WebP, become ours to get right.
  It would also be the place to read a HEIC's turn, which option 1 leaves out.

---

## More information

Revisit if a source arrives that the pool cannot read a size from but that knows one — a relay
whose upstream says it — or if the 512 KiB head is seen to leave real photographs unmeasured.
