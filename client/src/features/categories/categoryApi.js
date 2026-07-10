import { apiClient } from "../../lib/apiClient";

export async function getCategories(params = {}) {
  const response = await apiClient.get("/categories", {
    params
  });

  return response.data;
}

export async function getHomeCategories() {
  const response = await apiClient.get("/categories", {
    params: {
      home: "true",
      tree: "false"
    }
  });

  return response.data;
}

export async function getCategoryBySlug(slug) {
  const response = await apiClient.get(`/categories/${slug}`);
  return response.data;
}