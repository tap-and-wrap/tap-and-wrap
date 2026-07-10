import { apiClient } from "../../lib/apiClient";

export async function getStoreConfig() {
  const response = await apiClient.get("/store-config");
  return response.data;
}