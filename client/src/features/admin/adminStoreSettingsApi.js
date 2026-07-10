import {
  apiClient
} from "../../lib/apiClient";

export async function getAdminStoreSettings() {
  const response =
    await apiClient.get(
      "/admin/store-settings"
    );

  return response.data;
}

export async function updateAdminStoreSettings(
  payload
) {
  const response =
    await apiClient.patch(
      "/admin/store-settings",
      payload
    );

  return response.data;
}

export function getAdminStoreSettingsErrorMessage(
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
    return "Could not connect to the settings server.";
  }

  return "Store settings could not be saved.";
}
