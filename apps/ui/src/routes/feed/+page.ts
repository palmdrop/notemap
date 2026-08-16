import type { PageLoad } from "./$types";
import { getFeed } from "$lib/api";

export const load: PageLoad = async () => {
  const result = await getFeed();

	if (result.error) {
		throw result.error;
	}

	return { feed: result.data.values };
};