import type { PoolPorts } from "../../types/api/ports";
import type {
  Destination,
  DestinationKind,
} from "../../types/domain/destination";
import type { DestinationKindName } from "../../types/domain/ids";
import type { SchemaIssue } from "../../types/json";

/** Whether the running code can make sense of a destination at all. */
export type Usability =
  | { readonly kind: "usable"; readonly declared: DestinationKind }
  | { readonly kind: "unusable"; readonly detail: string };

export function declaredKind(
  ports: PoolPorts,
  name: DestinationKindName,
): DestinationKind | undefined {
  return ports.destinations.kinds().find((each) => each.name === name);
}

export function usability(
  ports: PoolPorts,
  destination: Destination,
): Usability {
  const declared = declaredKind(ports, destination.kind);
  if (declared === undefined) {
    return {
      kind: "unusable",
      detail: `nothing here speaks the ${destination.kind} kind`,
    };
  }

  const issues = ports.schemas.validate(
    declared.settingsSchema,
    destination.settings,
  );
  if (issues.length > 0) {
    return {
      kind: "unusable",
      detail: `its settings no longer satisfy the ${destination.kind} kind: ${said(issues)}`,
    };
  }

  return { kind: "usable", declared };
}

function said(issues: readonly SchemaIssue[]): string {
  return issues
    .map((issue) => `${issue.path || "(root)"} ${issue.keyword}`)
    .join(", ");
}
