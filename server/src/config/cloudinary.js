import { v2 as cloudinary } from "cloudinary";

import { createHttpError } from "../utils/httpError.js";

let configuredCredentialsKey = "";

export function getCloudinaryClient() {
  const cloudName = String(
    process.env.CLOUDINARY_CLOUD_NAME || ""
  ).trim();

  const apiKey = String(
    process.env.CLOUDINARY_API_KEY || ""
  ).trim();

  const apiSecret = String(
    process.env.CLOUDINARY_API_SECRET || ""
  ).trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw createHttpError(
      503,
      "Cloudinary is not configured on the server"
    );
  }

  const credentialsKey =
    `${cloudName}:${apiKey}:${apiSecret}`;

  if (configuredCredentialsKey !== credentialsKey) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });

    configuredCredentialsKey = credentialsKey;
  }

  return cloudinary;
}