import mongoose from "mongoose";

const DEFAULT_OPTIONS = {
  serverSelectionTimeoutMS:
    15000,

  connectTimeoutMS:
    15000,

  socketTimeoutMS:
    45000,

  maxPoolSize:
    20,

  minPoolSize:
    0,

  maxIdleTimeMS:
    60000
};

export async function connectDB() {
  const mongoUri =
    String(
      process.env.MONGO_URI ||
        ""
    ).trim();

  if (!mongoUri) {
    throw new Error(
      "MONGO_URI is missing"
    );
  }

  const connection =
    await mongoose.connect(
      mongoUri,
      DEFAULT_OPTIONS
    );

  console.log(
    `MongoDB connected: ${connection.connection.host}`
  );

  return connection;
}

export async function disconnectDB() {
  if (
    mongoose.connection
      .readyState !== 0
  ) {
    await mongoose.disconnect();

    console.log(
      "MongoDB disconnected"
    );
  }
}
