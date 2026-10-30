# Mobile-first rethink

**Date**: 2026-10-30
**Status**: In progress
**Spec**: `docs/specs/shell.md`
**Closed**:

---

## Goal

The developer has read a published report: every route of the shell, as it is, critiqued for a
phone and for simplicity, with options. They have also seen mockups that redraw every route at 390, plus
1440 where the flow changes, and a clickable prototype of capture → route → done. They have
decided what lands in the web shell now and what waits for a mobile app, and the follow-up
plans are written.

This plan is a workflow for a driving session and two subagents. **It changes no code.** No
file under `apps/`, `packages/` or `docs/design/` is touched by the driver or by either agent at
any point. Code changes start only from a follow-up plan, and only when the developer says to
implement it.

---

## Why

Notemap is meant to be picked up, given a quick note, told where it goes, and put down. The
shell has grown into something you have to read: the process surface shows destination,
place, tags, rewrites and preview all at once, and routing asks the reader to remember trigger
tags. On a phone that is worse. No feature is to be removed. The aim is to stage the features
into concrete steps: full-screen items, actions at the thumb, and moving between steps by
swiping from the side. That has to be designed before a mobile app is built, and the web shell
probably takes some of it now.

Everything about layout and labels is open. The register is kept: one face, ink on white, the
tokens in `docs/design/redrawn/tokens.css`.

---

## Roles

- **Driver**: the session that owns this plan. It stages the daemon, briefs and spawns the
  agents, checks their output, and reports to the developer. It does not write the report or
  the mockups itself.
- **Auditor**: an Opus subagent. It looks at every route, writes the critique with options, and
  publishes it.
- **Builder**: an Opus subagent. It reads the critique and builds the mockups into the same
  artifact.

Each agent's brief is written into its prompt from the phase below. Phase 2 does not start until
phase 1 has been checked.

---

## Getting into the stage

The driver signs in once and the agents never do. Failed sign-ins share one throttle for the
whole daemon, so an agent that loops on a wrong password locks everyone out with `429`.

- **Address**: `http://127.0.0.1:<app port>`. `edge` publishes only on loopback. `$STAGE_URL`
  is `http://palmdesk:<port>`, and `palmdesk` resolves to `127.0.1.1`, so it does not connect
  from this machine. The cookie is host-only, with no `Secure` flag and no `__Host-` prefix,
  because the stage's origin is `http:`. So a session signed in on loopback holds there. The
  daemon logs a single origin warning, which is harmless.
- **Chromium is launched with `--host-resolver-rules=MAP palmdesk 127.0.0.1`.** Link-preview
  images are named under `$STAGE_URL/_stage/`, and without the mapping every preview is a blank
  box in the shots.
- **Credential**: name `admin`, and the password is `NOTEMAP_PASSWORD` in
  `~/.config/agents/notemap.stage.env`. It is never written into a prompt, a script in the
  artifact, or the report.
- **Smoke test**: `POST /v1/session` with `{"name":"admin","password":…}` answers `200` with a
  `session` cookie, and `GET /v1/session` with that cookie answers `authenticated: true`.
- **Handover**: the driver signs in through the sign-in page in headless Chromium and saves
  Playwright's storage state to `/tmp/notemap-mobile-rethink/stage-state.json`. That path is
  outside the artifact, which is served. Agents launch with that storage state.
- **If an agent sees the sign-in page or a `401`**, it stops and tells the driver. It does not
  sign in itself and does not retry. The session lasts ten days. A rebuilt stage starts from
  empty volumes, so it needs a fresh sign-in by the driver.

---

## Ground rules for both agents

- Read first: `AGENTS.md`, `CONTEXT.md`, `docs/design/README.md`, `docs/design/brief.md`,
  `docs/specs/shell.md`, ADR 46, ADR 52, ADR 54, `docs/design/issues-2026-09-11.md`.
- **ADR 46's "one layout, 375px first" is open to revision.** Different views on a phone are
  what is being explored. Say plainly where a proposal departs from ADR 46 or ADR 52. Do not
  edit the ADRs; if the result is adopted it gets a superseding ADR in phase 4.
- **Words.** Button labels and microcopy may change freely. A domain term (`item`, `capture`,
  `template`, `destination`, `place`, …) may only be *proposed* for renaming, listed in its own
  section with the reason. `CONTEXT.md` is not edited.
- **Gestures.** In a mobile browser, iOS Safari and Android use an edge swipe for back and
  forward. Every gesture proposed is marked **web** (safe in the browser shell), **app** (needs
  a native or installed shell), or **both, with a fallback**. Each one also has a visible
  equivalent, such as a button, for keyboard and pointer.
- **No feature lost.** Every control the shell has today is placed somewhere in the proposal, or
  listed as deliberately moved (for example, desktop-only) with the reason.
- **Nothing is written into the repo's `src/`, `docs/design/`, specs or ADRs.** The output is
  one artifact. `docs/design/redrawn/` changes only when a design is settled and implemented,
  in its own PR.
- Scripts written for the run live in the artifact directory or `/tmp`, not in the repo.

---

## Phases

### Phase 0: Branch and stage

Depends on nothing.

- [x] Branch `agent/mobile-first-rethink` from `main`; commit this plan _(2026-10-30)_
- [x] `agent stage main`, and record its URL and app port _(2026-10-30 — app on `127.0.0.1:4800`)_
- [x] Sign in once, as the driver, and hand the agents a session rather than the password (see
      *Getting into the stage*) _(2026-10-30)_
- [x] `artifact new notemap-mobile-rethink`, and record its path and URL. Both agents write into it
      _(2026-10-30 — `~/agent-artifacts/projects/notemap/2026-10-30-1356-notemap-mobile-rethink`)_
- [ ] Commit

**Verify**: with the saved session, a headless Chromium opens the queue at 390, not the sign-in
page, and the artifact URL serves (empty is fine).

### Phase 1: Audit (Auditor, Opus)

Depends on phase 0.

- [x] Enumerate routes from `apps/ui/src/routes/`, not from a list handed over, and the states
      within each: the queue's quick tier on a row, the process surface and its bands, the item
      page, a record, the log and its views, settings and each section, the phone menu, sign-in,
      the status line, empty and offline states, the tag and template choosers
- [x] Screenshot every route and state at 1440 and 390 against the stage, signed in. Start from
      `oneshot show notemap-shoot-app`, and adapt a copy to sign in and to reach the states
      it skips. Shots go to `<artifact>/shots/current/`
- [x] Walk the three core tasks at 390 and count steps, taps, and what must be remembered or read:
      capture a note, route it by template, route it by hand to a destination and place
- [x] Write `<artifact>/audit.html`. Per route: shots side by side, then findings. Each finding is
      a problem in observable terms (what the reader has to read, remember, reach, or scroll
      past), then 2–3 options with trade-offs, then a recommendation. Cross-cutting findings
      (navigation model, where actions live, naming, ADR 46) get their own section. Close with
      a table that maps each control today to where each recommendation puts it
- [x] `<artifact>/index.html` links the audit, with a one-paragraph summary at the top
- [x] Driver: check the audit against the ground rules (every route present, every gesture
      marked, no feature lost, no repo edits outside the plan), and send it back to the Auditor
      with the gaps if any
- [x] Commit the plan's checkboxes _(2026-10-30)_

**Verify**: `git status` shows only this plan changed. Every directory under `apps/ui/src/routes/`
has shots at both widths in `shots/current/`. The control map has no control marked unplaced.

### Phase 2: Mockups (Builder, Opus)

Depends on phase 1 being checked by the driver.

- [ ] Read `audit.html` and take its recommendations. Where the Builder disagrees, it builds
      the recommendation and adds the alternative, noting why
- [ ] One static HTML file per route at 390 in `<artifact>/mockups/`, using
      `docs/design/redrawn/tokens.css` (copied in), in the plain-CSS manner of `docs/design/redrawn/`.
      Realistic content from the stage's seed, not lorem ipsum
- [ ] 1440 mockups only for routes whose flow changes on the desktop as well. Say which routes
      and why
- [ ] One clickable prototype, `<artifact>/prototype/`, covering capture → route by template →
      done, and capture → route by hand → done. Touch swipes and buttons both work, and it is
      usable on a real phone in its browser. Plain HTML, CSS and a little JS; no framework, no
      network
- [ ] Shots of every mockup into `<artifact>/shots/proposed/`, starting from `oneshot show
      notemap-shoot-drafts`
- [ ] `<artifact>/proposal.html`: per route, current shot beside proposed shot, then what changed
      and which audit finding it answers. A gestures table (web / app / both). Proposed renames,
      if any, in their own section. Then **the split**: for each change, whether it is a
      candidate for the web shell now, app only, or either, with the reason
- [ ] `index.html` links audit, proposal and prototype
- [ ] Commit the plan's checkboxes

**Verify**: every route in the audit has a proposed shot. The prototype completes both flows by
swipe and by button in Chromium's mobile emulation at 390. Every gesture is marked.

### Phase 3: Driver's review and report

Depends on phase 2.

- [ ] Driver opens the artifact and the prototype at 390 and 1440 and checks both flows. It
      checks the proposal against the audit and the ground rules, and sends defects back to the
      Builder
- [ ] Driver reports to the developer: the artifact URL, the three or four decisions that matter
      most, where the Auditor and the Builder disagreed, and the driver's own disagreements
- [ ] Commit the plan's checkboxes

**Verify**: the developer has the URL and the report.

**Checkpoint.** Stop here and wait. The developer reviews the proposed mobile look and confirms
it or asks for changes. Changes go back to the Builder (or the Auditor, if the critique is wrong)
and phase 3 repeats. Silence is not sign-off, and neither is a question about the report.

### Phase 4: Decide and plan

Depends on the developer's explicit sign-off at the checkpoint. Phase 4 writes docs only: an ADR,
`CONTEXT.md` and plans. Each of those is shown to the developer and confirmed before it is
committed.

- [ ] With the developer, settle the split route by route: web shell now, app only, or later
- [ ] ADR superseding ADR 46's layout decision, if what was settled departs from it (`core:adr`)
- [ ] Renames agreed, if any, into `CONTEXT.md`
- [ ] Follow-up plans: at least one for the web shell's share. The settled drawings move into
      `docs/design/redrawn/` in that plan's PR, not here. The mobile app gets its own design
      session (technology is a decision for the developer)
- [ ] Commit; open a PR for this branch

**Verify**: the follow-up plans exist in `docs/plans/` and each names the routes it covers.

---

## Unknowns

- **If the smoke test fails on a rebuilt stage.** Fallback: a scratch daemon with no password, using the
  recipe in `notemap-shoot-app`'s header, seeded with `pnpm seed` plus a filesystem destination
  and a template.
- **The stage's seed may not reach every state**: empty queue, offline, a failed delivery, an
  asking template. Fallback: the Auditor drives the state through the shell or the HTTP API,
  and lists any state it could not reach rather than inventing it.
- **Whether the artifact URL reaches the developer's phone.** If it is bound to localhost, the
  prototype is judged in mobile emulation only, and the report says so.
- **Swipe in the prototype vs the browser's own edge swipe.** The prototype may hit the very
  conflict it is meant to expose. That is a finding, not a defect. The fallback is buttons.
- **Size of the audit.** If it exceeds what one agent does well in one run, split it by route
  group (queue and process; item and record; log; settings) and give each group its own agent,
  with the driver merging. Decide after the route enumeration.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

No shell behaviour changes in this plan, so there is nothing to test. The follow-up plans carry
the tests.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
