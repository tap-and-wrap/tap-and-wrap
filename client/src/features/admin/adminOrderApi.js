import { apiClient } from "../../lib/apiClient";

export async function getAdminDashboard() {
  const response = await apiClient.get(
    "/admin/orders/dashboard"
  );

  return response.data;
}

export async function getAdminOrders(params = {}) {
  const response = await apiClient.get(
    "/admin/orders",
    {
      params
    }
  );

  return response.data;
}

export async function getAdminOrder(id) {
  const response = await apiClient.get(
    `/admin/orders/${id}`
  );

  return response.data;
}

export async function updateAdminOrderStatus({
  id,
  payload
}) {
  const response = await apiClient.patch(
    `/admin/orders/${id}/status`,
    payload
  );

  return response.data;
}

export async function updateAdminPaymentStatus({
  id,
  payload
}) {
  const response = await apiClient.patch(
    `/admin/orders/${id}/payment`,
    payload
  );

  return response.data;
}

export function getAdminOrderErrorMessage(error) {
  const apiMessage =
    error?.response?.data?.message;

  if (apiMessage) {
    return apiMessage;
  }

  if (error?.code === "ERR_NETWORK") {
    return "Could not connect to the server.";
  }

  return "The order request could not be completed.";
}