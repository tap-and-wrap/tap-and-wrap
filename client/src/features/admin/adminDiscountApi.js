import {
  apiClient
} from "../../lib/apiClient";

export async function getAdminDiscounts(
  params = {}
) {
  const response =
    await apiClient.get(
      "/admin/discounts",
      {
        params
      }
    );

  return response.data;
}

export async function createAdminDiscount(
  payload
) {
  const response =
    await apiClient.post(
      "/admin/discounts",
      payload
    );

  return response.data;
}

export async function updateAdminDiscount({
  id,
  payload
}) {
  const response =
    await apiClient.patch(
      `/admin/discounts/${id}`,
      payload
    );

  return response.data;
}

export async function deleteAdminDiscount(
  id
) {
  const response =
    await apiClient.delete(
      `/admin/discounts/${id}`
    );

  return response.data;
}

export function getAdminDiscountErrorMessage(
  error
) {
  const apiMessage =
    error?.response?.data
      ?.message;

  if (apiMessage) {
    return apiMessage;
  }

  if (
    error?.code ===
    "ERR_NETWORK"
  ) {
    return "Could not connect to the server.";
  }

  return "The discount request could not be completed.";
}