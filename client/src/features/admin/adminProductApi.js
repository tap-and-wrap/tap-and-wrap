import { apiClient } from "../../lib/apiClient";

export async function getAdminProducts(params = {}) {
  const response = await apiClient.get(
    "/admin/products",
    {
      params
    }
  );

  return response.data;
}

export async function getAdminProduct(id) {
  const response = await apiClient.get(
    `/admin/products/${id}`
  );

  return response.data;
}

export async function createAdminProduct(payload) {
  const response = await apiClient.post(
    "/admin/products",
    payload
  );

  return response.data;
}

export async function updateAdminProduct({
  id,
  payload
}) {
  const response = await apiClient.patch(
    `/admin/products/${id}`,
    payload
  );

  return response.data;
}

export async function deleteAdminProduct(id) {
  const response = await apiClient.delete(
    `/admin/products/${id}`
  );

  return response.data;
}

export function getAdminProductErrorMessage(error) {
  const message =
    error?.response?.data?.message;

  if (message) {
    return message;
  }

  if (error?.code === "ERR_NETWORK") {
    return "Could not connect to the server.";
  }

  return "The product request could not be completed.";
}