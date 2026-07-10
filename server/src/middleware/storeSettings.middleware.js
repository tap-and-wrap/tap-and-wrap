import {
  ensureStoreSettingsCache
} from "../services/storeSettings.service.js";

export async function hydrateStoreSettings(
  req,
  res,
  next
) {
  try {
    await ensureStoreSettingsCache();
    next();
  } catch (error) {
    next(error);
  }
}
