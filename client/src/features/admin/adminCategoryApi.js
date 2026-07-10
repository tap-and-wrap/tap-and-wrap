import { apiClient } from "../../lib/apiClient";

export async function getAdminCategories() {
  const response = await apiClient.get(
    "/admin/categories"
  );

  return response.data;
}

export async function createAdminCategory(payload) {
  const response = await apiClient.post(
    "/admin/categories",
    payload
  );

  return response.data;
}

export async function updateAdminCategory({
  id,
  payload
}) {
  const response = await apiClient.patch(
    `/admin/categories/${id}`,
    payload
  );

  return response.data;
}

export async function deleteAdminCategory(id) {
  const response = await apiClient.delete(
    `/admin/categories/${id}`
  );

  return response.data;
}

export function getAdminCategoryErrorMessage(error) {
  const apiMessage =
    error?.response?.data?.message;

  if (apiMessage) {
    return apiMessage;
  }

  if (error?.code === "ERR_NETWORK") {
    return "Could not connect to the server.";
  }

  return "The category request could not be completed.";
}