import {
  apiClient
} from "../../lib/apiClient";

export async function createOrder(
  payload
) {
  const response =
    await apiClient.post(
      "/orders",
      payload
    );

  return response.data;
}

export async function retryCardPayment({
  orderNumber,
  email
}) {
  const response =
    await apiClient.post(
      "/payments/paymob/retry",
      {
        orderNumber,
        email
      }
    );

  return response.data;
}

export async function getPaymobPaymentResult(
  params
) {
  const response =
    await apiClient.get(
      "/payments/paymob/result",
      {
        params
      }
    );

  return response.data;
}

export function getOrderErrorMessage(
  error
) {
  const apiMessage =
    error?.response?.data
      ?.message;

  if (apiMessage) {
    return apiMessage;
  }

  if (
    error?.code ===
    "ERR_NETWORK"
  ) {
    return "Could not connect to the server. Make sure the backend is running.";
  }

  return "The order could not be placed. Please try again.";
}
