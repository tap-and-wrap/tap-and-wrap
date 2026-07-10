import {
  apiClient
} from "../../lib/apiClient";

export async function trackOrder(
  payload
) {
  const response =
    await apiClient.post(
      "/order-tracking",
      payload
    );

  return response.data;
}

export function getTrackingErrorMessage(
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
    return "Could not connect to the tracking server.";
  }

  return "The order could not be found.";
}