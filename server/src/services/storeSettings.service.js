import StoreSettings from "../models/StoreSettings.js";

import {
  buildDefaultStoreSettings,
  getRuntimeStoreSettings,
  setRuntimeStoreSettings
} from "../config/storeConfig.js";

const CACHE_TTL_MS = 60 * 1000;

let cachedAt = 0;
let cachedDocument = null;
let inFlightLoad = null;

function toPlainSettings(document) {
  if (!document) {
    return null;
  }

  return typeof document.toObject ===
    "function"
    ? document.toObject()
    : {
        ...document
      };
}

async function createInitialSettings() {
  const defaults =
    buildDefaultStoreSettings();

  try {
    return await StoreSettings.create({
      singletonKey: "default",
      ...defaults
    });
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    return StoreSettings.findOne({
      singletonKey: "default"
    });
  }
}

async function loadStoreSettingsDocument() {
  let document =
    await StoreSettings.findOne({
      singletonKey: "default"
    });

  if (!document) {
    document =
      await createInitialSettings();
  }

  return document;
}

export async function ensureStoreSettingsCache({
  forceRefresh = false
} = {}) {
  const cacheIsFresh =
    cachedDocument &&
    Date.now() - cachedAt <
      CACHE_TTL_MS;

  if (
    !forceRefresh &&
    cacheIsFresh
  ) {
    setRuntimeStoreSettings(
      cachedDocument
    );

    return cachedDocument;
  }

  if (
    !forceRefresh &&
    inFlightLoad
  ) {
    return inFlightLoad;
  }

  inFlightLoad =
    loadStoreSettingsDocument()
      .then((document) => {
        cachedDocument =
          toPlainSettings(
            document
          );

        cachedAt = Date.now();

        setRuntimeStoreSettings(
          cachedDocument
        );

        return cachedDocument;
      })
      .finally(() => {
        inFlightLoad = null;
      });

  return inFlightLoad;
}

export async function getStoreSettingsDocument({
  forceRefresh = false
} = {}) {
  await ensureStoreSettingsCache({
    forceRefresh
  });

  return StoreSettings.findOne({
    singletonKey: "default"
  });
}

export function getCachedStoreSettings() {
  return (
    cachedDocument ||
    getRuntimeStoreSettings()
  );
}

export function updateStoreSettingsCache(
  settings
) {
  cachedDocument =
    toPlainSettings(settings);

  cachedAt = Date.now();

  setRuntimeStoreSettings(
    cachedDocument
  );

  return cachedDocument;
}

export function clearStoreSettingsCache() {
  cachedDocument = null;
  cachedAt = 0;
  inFlightLoad = null;
}
