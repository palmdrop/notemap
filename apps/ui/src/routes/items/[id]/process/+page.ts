import type { PageLoad } from "./$types";

/** The address is the item's id, which is all this surface needs to read it. */
export const load: PageLoad = ({ params }) => ({ id: params.id });
