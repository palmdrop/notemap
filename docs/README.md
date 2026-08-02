# notemap docs

notemap captures anything worth keeping into one pool, enriches it without altering it, and
routes it out to wherever it actually lives. It is a conveyor belt, not an archive: items are
supposed to leave.

## Current

| | |
|---|---|
| [../CONTEXT.md](../CONTEXT.md) | The glossary. Use these words; avoid the listed alternatives. |
| [specs/core.md](specs/core.md) | What core is and does, in observable terms. |
| [specs/http-v1.md](specs/http-v1.md) · [specs/sync.md](specs/sync.md) · [specs/mirror.md](specs/mirror.md) | The `/v1` surface, the client sync contract, the mirror on disk. Stubs awaiting their own grilling sessions. |
| [adr/](adr/) | The decisions, and why. Read before re-opening a settled question. |
| [standards.md](standards.md) | Principles, formats and the interop contract. |
| [plans/](plans/) · [reviews/](reviews/) | Implementation plans and code reviews, as they happen. |

## Background

[exploration/](exploration/README.md) is the design phase that produced the above: the flows
notemap grew out of, the prior-art survey, the try-existing-tools-first plan, and the vision
docs the model was derived from. Kept because the ADRs cite it as rationale — but it is
**frozen**, and where it disagrees with an ADR, the ADR wins. Amendments made after a decision
are marked inline and dated.
