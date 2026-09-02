import { acknowledged, answered, type Api } from "#api/http";
import type {
  CandidatesRequest,
  CreateDestinationRequest,
  Destination,
  DestinationCandidates,
  DestinationDescription,
  DestinationId,
  DestinationKind,
  DestinationProbe,
  DestinationRemembered,
  RememberedRequest,
  UpdateDestinationRequest,
} from "#api/types";
import type { DestinationsApi } from "../types";
import type { Observable } from "rxjs";

export type DestinationsDeps = {
  readonly api: Api;
  /** The cache a screen renders from, which every call here keeps current. */
  readonly all: Observable<readonly Destination[]>;
  readonly cached: (destinations: readonly Destination[]) => Promise<void>;
  /** Replaces or drops one, so a mutation does not cost a second read. */
  readonly settled: (id: DestinationId, held?: Destination) => Promise<void>;
};

/** None of this is an outbox operation: an offline edit would accept what the pool may refuse. */
export function createDestinations(deps: DestinationsDeps): DestinationsApi {
  const { api } = deps;

  return {
    all: deps.all,

    async load(): Promise<readonly Destination[]> {
      const answer = await answered(api.GET("/v1/destinations"));
      await deps.cached(answer.values);
      return answer.values;
    },

    async kinds(): Promise<readonly DestinationKind[]> {
      const answer = await answered(api.GET("/v1/destination-kinds"));
      return answer.values;
    },

    describe(id: DestinationId): Promise<DestinationDescription> {
      return answered(
        api.GET("/v1/destinations/{id}/description", {
          params: { path: { id } },
        }),
      );
    },

    /** Whether it is really there, which describing never asks. Kept by nothing here. */
    probe(id: DestinationId): Promise<DestinationProbe> {
      return answered(
        api.GET("/v1/destinations/{id}/probe", {
          params: { path: { id } },
        }),
      );
    },

    /** A passthrough on `describe()`'s own terms: asked now, kept by nothing here. */
    candidates(
      id: DestinationId,
      request: CandidatesRequest,
    ): Promise<DestinationCandidates> {
      return answered(
        api.GET("/v1/destinations/{id}/candidates", {
          params: { path: { id }, query: request },
        }),
      );
    },

    /** The pool's own answer, and so the one that survives an unreachable destination. */
    remembered(
      id: DestinationId,
      request: RememberedRequest,
    ): Promise<DestinationRemembered> {
      return answered(
        api.GET("/v1/destinations/{id}/remembered", {
          params: { path: { id }, query: request },
        }),
      );
    },

    async create(request: CreateDestinationRequest): Promise<Destination> {
      const created = await answered(
        api.POST("/v1/destinations", { body: request }),
      );
      await deps.settled(created.id, created);
      return created;
    },

    async update(
      id: DestinationId,
      changes: UpdateDestinationRequest,
    ): Promise<Destination> {
      const edited = await answered(
        api.PATCH("/v1/destinations/{id}", {
          params: { path: { id } },
          body: changes,
        }),
      );
      await deps.settled(id, edited);
      return edited;
    },

    retire: (id) => retirement(deps, id, "retire"),
    unretire: (id) => retirement(deps, id, "unretire"),

    async delete(id: DestinationId): Promise<void> {
      await acknowledged(
        api.DELETE("/v1/destinations/{id}", { params: { path: { id } } }),
      );
      await deps.settled(id);
    },
  };
}

async function retirement(
  deps: DestinationsDeps,
  id: DestinationId,
  which: "retire" | "unretire",
): Promise<Destination> {
  const answer = await (which === "retire"
    ? answered(
        deps.api.POST("/v1/destinations/{id}/retire", {
          params: { path: { id } },
        }),
      )
    : answered(
        deps.api.POST("/v1/destinations/{id}/unretire", {
          params: { path: { id } },
        }),
      ));

  await deps.settled(id, answer);
  return answer;
}
