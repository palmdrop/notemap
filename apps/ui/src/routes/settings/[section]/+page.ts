import { error } from "@sveltejs/kit";

import { isSection } from "$components/settings/href";

import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
  if (!isSection(params.section)) error(404, "no such settings section");
  return { section: params.section };
};
