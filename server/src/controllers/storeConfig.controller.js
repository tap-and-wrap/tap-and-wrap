import {
  getPublicStoreConfig
} from "../config/storeConfig.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  ensureStoreSettingsCache,
  getCachedStoreSettings
} from "../services/storeSettings.service.js";

export const getStoreConfig =
  asyncHandler(async (req, res) => {
    await ensureStoreSettingsCache();

    res.status(200).json({
      success: true,

      config:
        getPublicStoreConfig(
          getCachedStoreSettings()
        )
    });
  });
