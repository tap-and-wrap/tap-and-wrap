import multer from "multer";

import { createHttpError } from "../utils/httpError.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const imageUploader = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },

  fileFilter(req, file, callback) {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(
        createHttpError(
          400,
          "Only JPG, PNG, and WEBP images are allowed"
        )
      );
    }

    return callback(null, true);
  }
});

export function uploadSingleImage(req, res, next) {
  imageUploader.single("image")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return next(
          createHttpError(
            400,
            "The uploaded image cannot exceed 5 MB"
          )
        );
      }

      if (error.code === "LIMIT_FILE_COUNT") {
        return next(
          createHttpError(
            400,
            "Only one image can be uploaded at a time"
          )
        );
      }

      return next(
        createHttpError(
          400,
          "The image could not be uploaded"
        )
      );
    }

    return next(error);
  });
}

export const uploadSingleCustomerImage =
  uploadSingleImage;