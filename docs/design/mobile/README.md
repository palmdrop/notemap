# notemap design: the phone-first shell

The redesign of the shell for a phone first, in plain HTML, CSS and a little JS
([ADR 71](../../adr/0071-the-shell-is-drawn-for-a-phone-first-in-blocks-on-three-surfaces.md) to
[75](../../adr/0075-a-setting-left-unset-is-drawn-as-its-default.md)). Nothing here is built and
nothing here is the app: it is what the shell is implemented against. Copied on 2026-11-13 from
the scratch repo it was drawn in (`~/repos/notemap-design`), which stays the place to change it;
copy again when it changes.

- `DECISIONS.md`: what was settled with the developer, and what the plan carries into the specs.
- `shots/`: every state at 390, in the order of a walk through the shell.
- The reviews that shaped it: [audit](../../reviews/mobile-rethink-audit-2026-10-30.md),
  [first review](../../reviews/mobile-design-review-2026-11-09.md),
  [second review](../../reviews/mobile-design-review-2026-11-13.md).

Run `node server.mjs [port] [host]` (default `127.0.0.1:5190`). Every open page reloads when a file
changes. `node server.mjs 5190 0.0.0.0` lets a phone on the network reach it.

## What is where

- `queue.html` and the other views: one static HTML file per view, markup written out by hand.
- `css/tokens.css`: every colour, face, size and spacing, by role. `css/base.css`: shared
  elements and the phone frame. `css/<view>.css`: one view's own rules.
- `js/design.js`: the design panel at the top left of a wide window. It picks the icon set, turns
  the phone frame and a mock keyboard on and off.
  `morph.html` shows the morph shape drawn seven ways; any page takes `?morph=<name>`. `?icons=<set>` picks a set from the address, and `?dev` shows
  the panel on a narrow screen.
- `css/bars.css`: bars of actions and choices, drawn as blocks. Only the item's Previous and Next
  keep the morph shape.
- `js/templates.js`: the routing templates the queue, the item view and the capture page share.
- `DECISIONS.md`: what was settled with the developer, and what the plan carries into notemap.
- `icons/<set>.svg`: one sprite per set, built by `scripts/build-icons.mjs`. Markup names an icon
  by role, `<svg class="i"><use href="#i-menu"></use></svg>`, and never by a set's own name.
  `icons/sets.json` holds each set's licence and the roles it lacks. `scripts/mix-icons.mjs` builds
  a set from others' sprites: `notemap`, the default, is Carbon with Tabler's route.
- `fonts/syne/`, `fonts/arimo/`: Syne for display and Arimo, metric-compatible with Arial, for
  text. Both SIL Open Font License 1.1.
- `reference/`: the developer's sketch, the inspiration for this round, and round 2's prototype.
- `assets/`: pictures standing in for captured ones.
- `TODO.md`: design ideas parked for later.

## How the work goes

The views are explored first, one at a time, starting with the queue. The principles are
written down afterwards, from what the exploration settled, not decided up front.
