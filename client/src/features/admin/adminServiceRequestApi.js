import {
  apiClient
} from "../../lib/apiClient";

export async function getAdminServiceRequests(
  params = {}
) {
  const response =
    await apiClient.get(
      "/admin/service-requests",
      {
        params
      }
    );

  return response.data;
}

export async function getAdminServiceRequest(
  id
) {
  const response =
    await apiClient.get(
      `/admin/service-requests/${id}`
    );

  return response.data;
}

export async function updateAdminServiceRequest({
  id,
  payload
}) {
  const response =
    await apiClient.patch(
      `/admin/service-requests/${id}`,
      payload
    );

  return response.data;
}

export function getAdminServiceRequestErrorMessage(
  error
) {
  const message =
    error?.response?.data
      ?.message;

  if (message) {
    return message;
  }

  if (
    error?.code ===
    "ERR_NETWORK"
  ) {
    return "Could not connect to the server.";
  }

  return "The service request could not be updated.";
}