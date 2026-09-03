import type { PageLoad } from "./$types";

/** A record is an item's detail, so its address carries both ids. */
export const load: PageLoad = ({ params }) => ({
  id: params.id,
  record: params.recordId,
});
