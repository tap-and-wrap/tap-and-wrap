import { apiClient } from "../../lib/apiClient";

export async function getProducts(params = {}) {
  const response = await apiClient.get("/products", {
    params
  });

  return response.data;
}

export async function getProductBySlug(slug) {
  const response = await apiClient.get(`/products/${slug}`);
  return response.data;
}