import {
  apiClient
} from "../../lib/apiClient";

export async function createServiceRequest(
  payload
) {
  const response =
    await apiClient.post(
      "/service-requests",
      payload
    );

  return response.data;
}

export function getServiceRequestErrorMessage(
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

  return "Your service request could not be submitted.";
}