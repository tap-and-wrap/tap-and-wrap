import "dotenv/config";
import mongoose from "mongoose";

import Admin from "../models/Admin.js";
import { connectDB } from "../config/db.js";

function getRequiredEnvironmentValue(name) {
  const value = String(process.env[name] || "").trim();

  if (!value) {
    throw new Error(`${name} is missing from server/.env`);
  }

  return value;
}

async function seedAdmin() {
  await connectDB();

  const name = getRequiredEnvironmentValue("ADMIN_NAME");
  const email = getRequiredEnvironmentValue(
    "ADMIN_EMAIL"
  ).toLowerCase();

  const password = getRequiredEnvironmentValue(
    "ADMIN_PASSWORD"
  );

  if (password.length < 10) {
    throw new Error(
      "ADMIN_PASSWORD must contain at least 10 characters"
    );
  }

  let admin = await Admin.findOne({
    email
  }).select("+password");

  if (!admin) {
    admin = new Admin({
      name,
      email,
      password,
      role: "owner",
      isActive: true
    });

    await admin.save();

    console.log(`Owner admin created: ${email}`);
  } else {
    admin.name = name;
    admin.password = password;
    admin.role = "owner";
    admin.isActive = true;

    await admin.save();

    console.log(`Owner admin updated: ${email}`);
  }

  await mongoose.disconnect();
}

seedAdmin().catch(async (error) => {
  console.error("Admin seed failed:", error.message);

  await mongoose.disconnect();

  process.exit(1);
});