import "dotenv/config";

import app from "./app.js";

import {
  connectDB,
  disconnectDB
} from "./config/db.js";

import {
  validateEnvironment
} from "./config/environment.js";

const {
  nodeEnvironment,
  allowedOrigins
} =
  validateEnvironment();

const port =
  Number.parseInt(
    process.env.PORT,
    10
  ) ||
  5000;

let server = null;
let shuttingDown =
  false;

async function startServer() {
  await connectDB();

  server =
    app.listen(
      port,
      "0.0.0.0",
      () => {
        console.log(
          `Tap & Wrap API running on port ${port}`
        );

        console.log(
          `Environment: ${nodeEnvironment}`
        );

        console.log(
          `Allowed origins: ${allowedOrigins.join(
            ", "
          )}`
        );
      }
    );

  server.keepAliveTimeout =
    65000;

  server.headersTimeout =
    66000;
}

async function shutdown(
  signal,
  exitCode = 0
) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    `${signal} received. Closing server...`
  );

  const forceExit =
    setTimeout(() => {
      console.error(
        "Forced shutdown after timeout"
      );

      process.exit(1);
    }, 15000);

  forceExit.unref();

  try {
    if (server) {
      await new Promise(
        (
          resolve,
          reject
        ) => {
          server.close(
            (error) => {
              if (error) {
                reject(error);
                return;
              }

              resolve();
            }
          );
        }
      );
    }

    await disconnectDB();

    process.exit(
      exitCode
    );
  } catch (error) {
    console.error(
      "Graceful shutdown failed:",
      error
    );

    process.exit(1);
  }
}

process.on(
  "SIGTERM",
  () =>
    shutdown(
      "SIGTERM"
    )
);

process.on(
  "SIGINT",
  () =>
    shutdown(
      "SIGINT"
    )
);

process.on(
  "unhandledRejection",
  (reason) => {
    console.error(
      "Unhandled promise rejection:",
      reason
    );

    shutdown(
      "unhandledRejection",
      1
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "Uncaught exception:",
      error
    );

    shutdown(
      "uncaughtException",
      1
    );
  }
);

startServer().catch(
  (error) => {
    console.error(
      "Server startup failed:",
      error
    );

    process.exit(1);
  }
);
