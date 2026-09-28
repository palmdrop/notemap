/**
 * The router's copy of the address, for a test to move as a person going back
 * and forward would. Stands in for `$app/state`, and is read reactively.
 */
let path = $state("/");

export const address = {
  get path() {
    return path;
  },
  set path(to: string) {
    path = to;
  },
};

export const page = {
  get url() {
    return new URL(`http://localhost${path}`);
  },
  get route() {
    return { id: path.startsWith("/feed") ? "/feed" : "/" };
  },
};
