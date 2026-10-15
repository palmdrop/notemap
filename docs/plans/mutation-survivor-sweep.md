# Sweep the surviving mutants, one package per session

**Date**: 2026-10-15
**Status**: Todo <!-- Todo | In progress | Done -->
**Closed**:

---

## Goal

Every package that has opted into mutation testing has had its survivors read
once by a session that triaged each into a real gap, an equivalent mutant or a
constant nobody should pin — with the real gaps closed, the rest written down
here, and `pnpm --filter <package> mutation` still green-to-the-baseline
afterwards.

Done means: each package below has a recorded covered-score before and after, a
line saying what its remaining survivors are, and no package left unread.

---

## Tasks

Baselines, measured 2026-10-15, as the percentage of **covered** mutants.
`core` is already done and is the worked example: 76.21% → 93.53%.

The one survivor that is about the code rather than the tests has a plan of its
own: [the mirror holds only delivered routes](mirror-holds-only-delivered-routes.md).

### 1. The weakest first

Depends on nothing. One session per package, in this order — weakest covered
score first, and both are cheap runs.

- [ ] Branch `agent/mutation-survivor-sweep`
- [ ] `destination-webdav` — 77.21% covered, 173 survivors, 36s a run
- [ ] `destination-fs` — 79.82% covered, 113 survivors, 27s a run
- [ ] `git commit` each package's tests as its own commit

Verify: `pnpm --filter @notemap/destination-webdav mutation` and the same for
`destination-fs` report a higher covered score than the line above, with the
package's own `test` and `typecheck` green.

### 2. The ones already near their ceiling

Depends on phase 1 only for the habit of reading the report first; the packages
are independent of each other.

- [ ] `destination-arena` — 84.07% covered, 90 survivors, 40s a run
- [ ] `output-markdown` — 86.18% covered, 77 survivors, 16s a run
- [ ] `relay` — 83.18% covered, 18 survivors, 3s a run
- [ ] `git commit`

Verify: as phase 1. Expect little movement and stop early rather than padding —
a package at its ceiling is a finding, not a failure.

### 3. The client, when someone is in it

Depends on phase 1 and 2 being finished, because this one is expensive enough to
want the triage habit already formed.

- [ ] `client` — 80.81% covered, 526 survivors, **6m04s** a whole-package run
- [ ] Work it per file with `--mutate src/<area>/<file>.ts`, starting with the
      outbox and the cache, rather than whole-package runs
- [ ] Note why the three mutants Stryker reports as errors crash the runner
      rather than dying — `atomic.ts` and `state/persist.ts` cleanup paths
- [ ] `git commit`

Verify: `pnpm --filter @notemap/client mutation` reports a higher covered score
than 80.81% and its own suite is green. A per-file run is not enough to close
the phase: the whole-package number is the one recorded.

---

## How to run each session

One subagent per package, Sonnet, started from a session in this worktree. The
prompt below is the one that worked on `core`; it produced 909 lines of tests,
no production changes, and a report that distinguished the three buckets. Swap
the package name and the baseline figure.

```
You are working in the notemap repo at <worktree path>. Read CLAUDE.md and
AGENTS.md first — the house rules are strict and they matter here, especially
the ones about comments, test placement, and not changing behaviour without
asking.

Read the "Mutation testing" section of AGENTS.md, then run
`pnpm --filter <package> mutation` and open <package>/.stryker-tmp/report.json.
The baseline you should see is <N>% of covered mutants, with roughly <M>
survivors.

Ignore every NoCoverage mutant: that is code this package's own tests never
reach and other packages' tests do, and it is explicitly not your job.

Group the Survived mutants by file and triage each into one of three buckets:
- a real gap in this package's own tests — a decision nothing checks;
- an equivalent mutant that cannot be killed, because the types, an earlier
  guard, or the shape of the inputs make the mutated code indistinguishable;
- a constant or a message no assertion should pin.

Write tests only for the real gaps. Tests live beside the code they test, in the
style of the tests already there — read a few neighbours first and match them,
including how they are named. Do not mock modules: nothing outside apps/ui does.
Do not add a test that asserts an implementation detail just to kill a mutant;
if the only way to kill it is to pin something that isn't behaviour, it belongs
in the second or third bucket instead.

Iterate on one file at a time with `--mutate src/<file>.ts`, which takes seconds
instead of a whole run. Work through the files with the most survivors first and
stop when you have covered the ones that are worth it — you do not have to reach
every file, and padding the score is worse than stopping.

If a survivor points at the code rather than the tests — dead code, a guard that
can never fire, a boundary that is wrong, a comment claiming something the code
does not enforce — do NOT change it. Write it down and report it. The same goes
for any change to production code: raise it, do not make it.

Before you finish: `pnpm --filter <package> test` and the same `typecheck` must
pass, and run `pnpm exec prettier --write` on the files you touched.

Report back, concisely: the covered percentage before and after; which files you
touched and what each new test pins down; the survivors you judged unkillable,
grouped by reason; and anything you found out about the code rather than the
tests.
```

Verify the report rather than relaying it: re-run the package's mutation, read
the score off `report.json` yourself, and read the diff for style. On `core` the
agent's figures were right to within run-to-run noise, and its report exposed a
config hole — `arbitraries.ts` was being mutated as though it were production
code — which is the kind of thing only a second read catches.

---

## Unknowns

- **Whether `client`'s 526 survivors are worth a session at all.** Much of that
  package is state machines whose decisions matter, but a 6-minute run makes the
  loop slow and the triage cost high. Fallback: do the outbox and the cache per
  file, record the rest as unread, and close the phase honestly rather than
  pretending the package was swept.
- **Whether a package at its ceiling should be excluded from the score instead.**
  `core` dropped its composition root for a written reason. If another package
  turns out to be mostly delegation, the same move may be right — but it is a
  decision to raise, not one for a sweeping session to take.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests
already exist.

A sweep session writes nothing but tests. A survivor that turns out to be about
the code goes in the report and then to the developer, not into a fix.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
