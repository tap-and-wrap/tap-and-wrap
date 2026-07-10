import "dotenv/config";

import {
  validateEnvironment
} from "../config/environment.js";

try {
  const result =
    validateEnvironment();

  console.log(
    "Environment configuration is valid."
  );

  console.log(
    `NODE_ENV: ${result.nodeEnvironment}`
  );

  console.log(
    "Allowed origins:"
  );

  for (
    const origin of
      result.allowedOrigins
  ) {
    console.log(
      `- ${origin}`
    );
  }
} catch (error) {
  console.error(
    error.message
  );

  process.exitCode = 1;
}
