import { apiClient } from "../../lib/apiClient";

export async function previewOrderPricing(payload) {
  const response = await apiClient.post(
    "/pricing/preview",
    payload
  );

  return response.data;
}

export function getPricingErrorMessage(error) {
  const message = error?.response?.data?.message;

  if (message) {
    return message;
  }

  if (error?.code === "ERR_NETWORK") {
    return "Could not connect to the pricing server.";
  }

  return "The order price could not be calculated.";
}
