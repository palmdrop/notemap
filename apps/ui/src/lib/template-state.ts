import type { RoutingTemplateReport } from "@notemap/client";

/**
 * What a template's report says, in a line. Only the two a person has to act
 * on take the accent: a destination that cannot be asked is an ordinary
 * condition, a vault asleep on a train.
 */
export function reportSaid(
  report: RoutingTemplateReport | undefined,
  asking: boolean,
): { text: string; alarm: boolean; asking?: boolean } {
  if (report === undefined) {
    return { text: "not asked yet", alarm: false, asking };
  }
  switch (report.kind) {
    case "fits":
      return { text: "ok", alarm: false };
    case "stranded":
      return { text: "destination deleted", alarm: true };
    case "destination-retired":
      return { text: "destination disabled", alarm: true };
    case "folder-missing":
      return { text: `${report.folder} missing`, alarm: true };
    case "capability-undeclared":
      return { text: `${report.capability} is no longer offered`, alarm: true };
    case "arguments-invalid":
      return { text: "arguments refused", alarm: true };
    case "destination-unusable":
      return { text: report.detail, alarm: false };
    case "unreachable":
      return { text: "not reachable", alarm: false };
  }
}
