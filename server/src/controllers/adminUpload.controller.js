import { nanoid } from "nanoid";

import {
  getCloudinaryClient
} from "../config/cloudinary.js";

import {
  getUploadDefinition
} from "../config/uploadConfig.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  createHttpError
} from "../utils/httpError.js";

function uploadBuffer(file, definition) {
  const cloudinary = getCloudinaryClient();

  return new Promise((resolve, reject) => {
    const uploadStream =
      cloudinary.uploader.upload_stream(
        {
          resource_type: "image",
          folder: definition.folder,

          public_id:
            `product-${nanoid(16)}`,

          overwrite: false,
          unique_filename: false,
          use_filename: false,

          transformation: [
            {
              width: definition.maxWidth,
              height: definition.maxHeight,
              crop: "limit",
              quality: "auto",
              fetch_format: "auto"
            }
          ]
        },

        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(result);
        }
      );

    uploadStream.end(file.buffer);
  });
}

export const uploadAdminProductImage =
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw createHttpError(
        400,
        "Please choose a product image"
      );
    }

    const definition =
      getUploadDefinition("product_image");

    let result;

    try {
      result = await uploadBuffer(
        req.file,
        definition
      );
    } catch (error) {
      console.error(
        "Product image upload failed:",
        error
      );

      throw createHttpError(
        502,
        "The product image could not be uploaded"
      );
    }

    res.status(201).json({
      success: true,
      message: "Product image uploaded successfully",

      asset: {
        url: result.secure_url,
        publicId: result.public_id,
        originalFileName: req.file.originalname,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes
      }
    });
  });