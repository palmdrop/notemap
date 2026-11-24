/**
 * The router's copy of the address, for a test to move as a person going back
 * and forward would. Stands in for `$app/state`, and is read reactively.
 */
let path = $state("/");
let state = $state<App.PageState>({});

export const address = {
  get path() {
    return path;
  },
  set path(to: string) {
    path = to;
  },
  get state(): App.PageState {
    return state;
  },
  set state(to: App.PageState) {
    state = to;
  },
};

export const page = {
  get url() {
    return new URL(`http://localhost${path}`);
  },
  get route() {
    return { id: path.startsWith("/feed") ? "/feed" : "/" };
  },
  get state(): App.PageState {
    return state;
  },
};
