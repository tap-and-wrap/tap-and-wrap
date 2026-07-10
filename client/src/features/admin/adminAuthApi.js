import { apiClient } from "../../lib/apiClient";

export async function loginAdmin(credentials) {
  const response = await apiClient.post(
    "/admin/auth/login",
    credentials
  );

  return response.data;
}

export async function logoutAdmin() {
  const response = await apiClient.post(
    "/admin/auth/logout"
  );

  return response.data;
}

export async function getCurrentAdmin() {
  const response = await apiClient.get(
    "/admin/auth/me"
  );

  return response.data;
}

export function getAdminAuthErrorMessage(error) {
  const apiMessage = error?.response?.data?.message;

  if (apiMessage) {
    return apiMessage;
  }

  if (error?.code === "ERR_NETWORK") {
    return "Could not connect to the server.";
  }

  return "The admin request could not be completed.";
}