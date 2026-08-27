declare const __NOTEMAP_VERSION__: string | undefined;

export const VERSION =
  typeof __NOTEMAP_VERSION__ === "string" ? __NOTEMAP_VERSION__ : "0.0.0-dev";
