import {
  apiClient
} from "../../lib/apiClient";

export async function getAdminOffers(
  params = {}
) {
  const response =
    await apiClient.get(
      "/admin/offers",
      {
        params
      }
    );

  return response.data;
}

export async function createAdminOffer(
  payload
) {
  const response =
    await apiClient.post(
      "/admin/offers",
      payload
    );

  return response.data;
}

export async function updateAdminOffer({
  id,
  payload
}) {
  const response =
    await apiClient.patch(
      `/admin/offers/${id}`,
      payload
    );

  return response.data;
}

export async function deleteAdminOffer(
  id
) {
  const response =
    await apiClient.delete(
      `/admin/offers/${id}`
    );

  return response.data;
}

export function getAdminOfferErrorMessage(
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

  return "The bundle offer request could not be completed.";
}