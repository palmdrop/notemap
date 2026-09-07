import { pathField } from "../destinations/annotations";
import { candidates } from "../destinations/candidates";
import { describe } from "../destinations/reports";
import { usability } from "../destinations/usability";
import type { PoolPorts } from "#types/api/ports";
import type { Capability } from "#types/domain/destination";
import type { CapabilityName, RoutingTemplateId } from "#types/domain/ids";
import type { RoutingTemplate } from "#types/domain/template";
import type { JsonObject, SchemaIssue } from "#types/json";

/**
 * Whether a template's destination can support it *now*, asked per template and
 * answered by going and looking.
 *
 * `unreachable` is *cannot say*, and is not the same fact as anything below it:
 * a sleeping vault is an ordinary condition, and whatever draws this must not
 * paint it as an alarm.
 */
export type RoutingTemplateReport =
  | { readonly kind: "fits" }
  /** The destination it named was deleted. Repoint it, or delete it. */
  | { readonly kind: "stranded" }
  | { readonly kind: "destination-retired" }
  | { readonly kind: "destination-unusable"; readonly detail: string }
  | {
      readonly kind: "capability-undeclared";
      readonly capability: CapabilityName;
    }
  | {
      readonly kind: "arguments-invalid";
      readonly issues: readonly SchemaIssue[];
    }
  /** Only for `require`, and for an `establish` that has landed once. */
  | { readonly kind: "folder-missing"; readonly folder: string }
  | { readonly kind: "unreachable"; readonly detail: string };

export async function report(
  ports: PoolPorts,
  id: RoutingTemplateId,
  signal?: AbortSignal,
): Promise<RoutingTemplateReport | undefined> {
  const template = await ports.store.routingTemplate(id);
  if (template === undefined) return undefined;

  const destination = await ports.store.destination(template.destination);
  if (destination === undefined) return { kind: "stranded" };
  if (destination.retiredAt !== undefined) {
    return { kind: "destination-retired" };
  }

  const usable = usability(ports, destination);
  if (usable.kind === "unusable") {
    return { kind: "destination-unusable", detail: usable.detail };
  }

  const described = await describe(ports, destination.id, signal);
  if (described === undefined) return { kind: "stranded" };
  if (described.kind === "unusable") {
    return { kind: "destination-unusable", detail: described.detail };
  }
  if (described.kind === "undescribable") {
    return { kind: "unreachable", detail: described.detail };
  }

  const capability = described.capabilities.find(
    (each) => each.name === template.capability,
  );
  if (capability === undefined) {
    return { kind: "capability-undeclared", capability: template.capability };
  }

  const issues = ports.schemas.validate(
    capability.argumentsSchema,
    asWritten(template),
  );
  if (issues.length > 0) return { kind: "arguments-invalid", issues };

  return folderReport(ports, template, capability, signal);
}

/**
 * The arguments as the template holds them, with the folder mode it would
 * resolve to. A pattern is a string, and every field these schemas declare a
 * pattern in is a string field, so this is the same check a routed argument set
 * gets — minus what only an item can settle.
 */
function asWritten(template: RoutingTemplate): JsonObject {
  return template.folder === "require" ||
    (template.folder === "establish" && template.establishedAt !== undefined)
    ? { ...template.arguments, folder: "require" }
    : template.arguments;
}

/**
 * Only where the template promised the folder would be there, and only where
 * the capability says which field the promise is about. A destination with no
 * folders above its places — a board column, a webhook — marks no field, and
 * there is nothing here to check rather than something failing quietly.
 *
 * The **literal prefix** is what is checked — the part of the path with no
 * pattern in it, which is exactly the part that moves — one level at a time, so
 * the answer names the segment that is actually missing rather than the whole
 * path.
 */
async function folderReport(
  ports: PoolPorts,
  template: RoutingTemplate,
  capability: Capability,
  signal?: AbortSignal,
): Promise<RoutingTemplateReport> {
  const required =
    template.folder === "require" ||
    (template.folder === "establish" && template.establishedAt !== undefined);
  if (!required) return { kind: "fits" };

  const field = pathField(capability);
  if (field === undefined) return { kind: "fits" };

  const place = template.arguments[field];
  if (typeof place !== "string") return { kind: "fits" };

  const segments = literalFolders(place);
  if (segments.length === 0) return { kind: "fits" };

  let scope: string | undefined;
  for (const segment of segments) {
    const answer = await candidates(
      ports,
      template.destination,
      {
        capability: template.capability,
        field,
        ...(scope === undefined ? {} : { scope }),
      },
      signal,
    );

    // A kind that cannot be asked, one that could not say, or a destination
    // that has gone since. None of them is *not there*.
    if (answer === undefined) return { kind: "stranded" };
    if (answer.kind === "unusable") {
      return { kind: "destination-unusable", detail: answer.detail };
    }
    if (answer.kind === "unreachable") {
      return { kind: "unreachable", detail: answer.detail };
    }
    if (answer.kind === "not-offered") return { kind: "fits" };

    const found = answer.entries.find((entry) => entry.label === segment);
    if (found === undefined || found.scope === undefined) {
      return {
        kind: "folder-missing",
        folder: `${[...walked(segments, segment)].join("/")}/`,
      };
    }
    scope = found.scope;
  }

  return { kind: "fits" };
}

/** The folders of a path, up to the first pattern: the part that a reorganisation moves. */
function literalFolders(place: string): readonly string[] {
  const literal = place.split("{{")[0] ?? "";
  const folders = literal.split("/").slice(0, -1);
  return folders.filter((segment) => segment !== "");
}

function* walked(
  segments: readonly string[],
  until: string,
): Generator<string> {
  for (const segment of segments) {
    yield segment;
    if (segment === until) return;
  }
}
