import type { Observable } from "rxjs";

import { acknowledged, answered, type Api } from "#api/http";
import { writable, type Writable } from "../observable/observable";

/** What signed this request in, where anything did. */
export type Signed =
  | { readonly kind: "session" }
  | { readonly kind: "token"; readonly name?: string };

export type SessionState = {
  /**
   * Whether this daemon asks at all. False on one nobody has set a password on,
   * where every request is let through and there is no login to draw.
   */
  readonly required: boolean;
  readonly signedIn: boolean;
  readonly as?: Signed;
  /**
   * Whether the daemon has been asked yet. A surface draws neither the login nor
   * the pool until this is true, or a cold start flashes a login at someone who
   * is already signed in.
   */
  readonly known: boolean;
};

/** Nothing asked yet, and nothing assumed: not signed in, and not drawing a login either. */
export const UNKNOWN: SessionState = {
  required: false,
  signedIn: false,
  known: false,
};

export type Sessions = {
  readonly changes: Observable<SessionState>;
  get(): SessionState;
  /** Asks the daemon who this is. Open, so it answers whether or not anyone is. */
  ask(): Promise<SessionState>;
  login(name: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /**
   * Recorded when a `401` arrives from anywhere: the credential was there and
   * is not now. Nothing is asked, because the answer already came.
   */
  lapsed(): void;
};

export type SessionDeps = {
  readonly api: Api;
  /**
   * Run when a session ends — signing out, or one lapsing. What is drawn came
   * from a pool the holder can no longer speak for; the outbox is the person's
   * own and is not the cache's to drop.
   */
  readonly forget: () => Promise<void>;
};

export function createSessions({ api, forget }: SessionDeps): Sessions {
  const state: Writable<SessionState> = writable(UNKNOWN);

  const took = (answer: {
    authenticated: boolean;
    requiresCredentials: boolean;
    identity?: { kind: "session" | "token"; name?: string };
  }): SessionState => ({
    required: answer.requiresCredentials,
    signedIn: answer.authenticated,
    known: true,
    ...(answer.identity === undefined
      ? {}
      : {
          as:
            answer.identity.kind === "token"
              ? {
                  kind: "token" as const,
                  ...(answer.identity.name === undefined
                    ? {}
                    : { name: answer.identity.name }),
                }
              : { kind: "session" as const },
        }),
  });

  return {
    changes: state.changes,
    get: () => state.get(),

    ask: async () => {
      const held = took(await answered(api.GET("/v1/session")));
      state.set(held);
      return held;
    },

    login: async (name, password) => {
      state.set(
        took(
          await answered(api.POST("/v1/session", { body: { name, password } })),
        ),
      );
    },

    logout: async () => {
      // The cache goes whether or not the daemon took the request: what is held
      // describes somewhere this client can no longer speak for either way.
      try {
        await acknowledged(api.DELETE("/v1/session"));
      } finally {
        await forget();
        state.set({
          required: state.get().required,
          signedIn: false,
          known: true,
        });
      }
    },

    lapsed: () => {
      if (!state.get().signedIn && state.get().known) return;

      state.set({ required: true, signedIn: false, known: true });
      void forget();
    },
  };
}
