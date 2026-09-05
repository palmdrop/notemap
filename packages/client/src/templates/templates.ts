import { acknowledged, answered, type Api } from "#api/http";
import type {
  CreateRoutingTemplateRequest,
  ItemId,
  ResolvedRoutingTemplate,
  RoutingTemplate,
  RoutingTemplateId,
  RoutingTemplateReport,
  UpdateRoutingTemplateRequest,
} from "#api/types";
import type { TemplatesApi } from "../types";
import type { Observable } from "rxjs";

export type TemplatesDeps = {
  readonly api: Api;
  /** The cache a screen renders from, which every call here keeps current. */
  readonly all: Observable<readonly RoutingTemplate[]>;
  /** The same cache, read now rather than subscribed to. */
  readonly held: () => readonly RoutingTemplate[];
  readonly cached: (templates: readonly RoutingTemplate[]) => Promise<void>;
  /** Replaces or drops one, so a mutation does not cost a second read. */
  readonly settled: (
    id: RoutingTemplateId,
    held?: RoutingTemplate,
  ) => Promise<void>;
};

/**
 * Cached on `destinations`' terms and for the same reason: a saved decision is
 * what the composer offers, and it has to be offerable while the pool is away.
 * None of this is an outbox operation — an offline edit would accept what the
 * pool may refuse.
 */
export function createTemplates(deps: TemplatesDeps): TemplatesApi {
  const { api } = deps;

  return {
    all: deps.all,

    get held() {
      return deps.held();
    },

    async load(): Promise<readonly RoutingTemplate[]> {
      const answer = await answered(api.GET("/v1/templates"));
      await deps.cached(answer.values);
      return answer.values;
    },

    /** Asked now and kept by nothing: what it found is true of a moment. */
    report(id: RoutingTemplateId): Promise<RoutingTemplateReport> {
      return answered(
        api.GET("/v1/templates/{id}/report", { params: { path: { id } } }),
      );
    },

    /** The pool's own expander, drawn rather than reimplemented on this side. */
    resolve(
      item: ItemId,
      template: RoutingTemplateId,
    ): Promise<ResolvedRoutingTemplate> {
      return answered(
        api.GET("/v1/items/{id}/route/resolve", {
          params: { path: { id: item }, query: { template } },
        }),
      );
    },

    async create(
      request: CreateRoutingTemplateRequest,
    ): Promise<RoutingTemplate> {
      const created = await answered(
        api.POST("/v1/templates", { body: request }),
      );
      await deps.settled(created.id, created);
      return created;
    },

    async update(
      id: RoutingTemplateId,
      changes: UpdateRoutingTemplateRequest,
    ): Promise<RoutingTemplate> {
      const edited = await answered(
        api.PATCH("/v1/templates/{id}", {
          params: { path: { id } },
          body: changes,
        }),
      );
      await deps.settled(id, edited);
      return edited;
    },

    async delete(id: RoutingTemplateId): Promise<void> {
      await acknowledged(
        api.DELETE("/v1/templates/{id}", { params: { path: { id } } }),
      );
      await deps.settled(id);
    },
  };
}
