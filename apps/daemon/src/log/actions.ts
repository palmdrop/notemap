import type { Action, ActionKind } from "@notemap/core";

import type { Logger } from "./create";
import type { LogLevel } from "./config";

/** The kinds that say something went wrong; everything else says what happened. */
const WARNINGS: ReadonlySet<ActionKind> = new Set<ActionKind>([
  "delivery-failed",
  "work-failed",
  "work-abandoned",
]);

export function actionLevel(kind: ActionKind): LogLevel {
  return WARNINGS.has(kind) ? "warn" : "info";
}

/** One line per action, with what the log holds spread as fields. */
export function logAction(log: Logger, action: Action): void {
  const { kind, subject, by, detail } = action;
  const { kind: agent, ...whom } = by;

  log[actionLevel(kind)](
    {
      kind,
      ...(subject === undefined ? {} : { item: subject }),
      by: agent,
      ...whom,
      ...detail,
    },
    "action",
  );
}
