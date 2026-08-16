import { api } from ".";

export const getFeed = async (after?: string) => {
  return await api.GET("/v1/feed", {
    params: {
      query: {
        order: "newest-first", 
        limit: "50",
        ...(after ? { after } : {})
      }
    }
  });
};