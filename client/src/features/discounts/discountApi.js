import {
  apiClient
} from "../../lib/apiClient";

export async function validateDiscount(
  payload
) {
  const response =
    await apiClient.post(
      "/discounts/validate",
      payload
    );

  return response.data;
}

export function getDiscountErrorMessage(
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
    return "Could not connect to the discount server.";
  }

  return "The discount code could not be applied.";
}