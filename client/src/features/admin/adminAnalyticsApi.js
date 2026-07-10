import {
  apiClient
} from "../../lib/apiClient";

export async function getAdminAnalytics({
  days = 30
} = {}) {
  const response =
    await apiClient.get(
      "/admin/analytics/overview",
      {
        params: {
          days
        }
      }
    );

  return response.data;
}

export function getAdminAnalyticsErrorMessage(
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
    return "Could not connect to the analytics server.";
  }

  return "Analytics could not be loaded.";
}