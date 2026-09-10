import { route } from "../routing/route";
import { refused } from "#utils/result";
import type { PoolConfig } from "#types/api/config";
import type { PoolPorts } from "#types/api/ports";
import type { TemplateRoutingRefusal } from "#types/api/refusal";
import type { ItemId, RoutingTemplateId } from "#types/domain/ids";
import type { Item } from "#types/domain/item";
import type { DeliveryRequest, RoutingRecord } from "#types/domain/routing";
import type { RoutingTemplate } from "#types/domain/template";
import type { JsonObject } from "#types/json";
import type { Result } from "#types/result";
import { FOLDER_ARGUMENT } from "../destinations/vocabulary";
import { expandPatterns } from "./patterns";

/** What a template would route as, without reserving anything. */
export type ResolvedTemplate = DeliveryRequest;

/**
 * The expansion, and nothing else. What the composer draws before the commit
 * and what `route/resolve` answers: one expander, drawn rather than
 * reimplemented on the other side of the wire.
 */
export async function resolve(
  config: PoolConfig,
  ports: PoolPorts,
  item: ItemId,
  id: RoutingTemplateId,
): Promise<ResolvedTemplate | undefined> {
  const [held, template] = await Promise.all([
    ports.store.item(item),
    ports.store.routingTemplate(id),
  ]);
  if (held === undefined || template === undefined) return undefined;

  return requestFor(config, held, template);
}

/**
 * Applying a template is the decision, so this lands in the same `route` path a
 * hand-made one takes. The patterns are expanded here, at the moment the
 * decision is made, and the record stores what they came out as: everything
 * that reads records keeps working with no knowledge that a template exists.
 */
export async function routeFrom(
  config: PoolConfig,
  ports: PoolPorts,
  item: ItemId,
  id: RoutingTemplateId,
  firedByTag: boolean,
  signal?: AbortSignal,
  /**
   * The words this one delivery carries. Not the template's — a template says
   * where an item goes and never what it says — so it rides beside the
   * expansion rather than being part of it.
   */
  content?: JsonObject,
): Promise<Result<RoutingRecord, TemplateRoutingRefusal>> {
  const [held, template] = await Promise.all([
    ports.store.item(item),
    ports.store.routingTemplate(id),
  ]);
  if (held === undefined) {
    return refused<RoutingRecord, TemplateRoutingRefusal>({
      kind: "no-such-item",
      item,
    });
  }
  if (template === undefined) {
    return refused<RoutingRecord, TemplateRoutingRefusal>({
      kind: "unknown-template",
      template: id,
    });
  }

  const request = requestFor(config, held, template);

  return route(
    config,
    ports,
    item,
    content === undefined ? request : { ...request, content },
    signal,
    { template: template.id, firedByTag },
  );
}

/** The expansion a decision from this template makes, however it was reached. */
export function requestFor(
  config: PoolConfig,
  item: Item,
  template: RoutingTemplate,
): DeliveryRequest {
  return {
    destination: template.destination,
    capability: template.capability,
    arguments: withFolder(
      template,
      expandPatterns(template.arguments, {
        capturedAt: item.createdAt,
        ...(item.utcOffset === undefined ? {} : { utcOffset: item.utcOffset }),
        zone: config.zone,
        item: item.id,
        source: item.source,
      }),
    ),
  };
}

/**
 * `establish` never leaves the template: unestablished it asks for the folder to
 * be made, established it asks for the folder to be there. So the arguments on
 * a record are always the two-valued thing, and the record is honest about what
 * it asked for.
 *
 * `create` is written as absence rather than as a value, because it is what
 * every capability already does with a folder that is not there — and one that
 * declares no such field would refuse an argument set carrying it.
 */
function withFolder(template: RoutingTemplate, args: JsonObject): JsonObject {
  const folder =
    template.folder === "establish"
      ? template.establishedAt === undefined
        ? "create"
        : "require"
      : template.folder;

  return folder === "create" ? args : { ...args, [FOLDER_ARGUMENT]: folder };
}
