import axios from "axios";

function normalizeApiUrl(
  value
) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

const configuredApiUrl =
  normalizeApiUrl(
    import.meta.env
      .VITE_API_URL
  );

const developmentApiUrl =
  "http://localhost:5000/api";

const API_URL =
  configuredApiUrl ||
  (import.meta.env.DEV
    ? developmentApiUrl
    : "");

if (!API_URL) {
  throw new Error(
    "VITE_API_URL is required for the production frontend"
  );
}

export const apiClient =
  axios.create({
    baseURL:
      API_URL,

    withCredentials:
      true,

    timeout:
      30000,

    headers: {
      Accept:
        "application/json",

      "Content-Type":
        "application/json"
    }
  });

export async function checkApiHealth() {
  const response =
    await apiClient.get(
      "/health"
    );

  return response.data;
}
