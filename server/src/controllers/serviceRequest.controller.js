import { nanoid } from "nanoid";

import ServiceRequest from "../models/ServiceRequest.js";

import {
  isTrustedCustomerUpload
} from "../config/uploadConfig.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  createHttpError
} from "../utils/httpError.js";

import {
  createServiceRequestSchema
} from "../validators/serviceRequest.validator.js";

import {
  queueServiceRequestCreatedNotifications
} from "../services/notification.service.js";

function createRequestNumber() {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");

  return (
    `SR-${date}-` +
    nanoid(6).toUpperCase()
  );
}

export const createServiceRequest =
  asyncHandler(
    async (req, res) => {
      const validation =
        createServiceRequestSchema.safeParse(
          req.body
        );

      if (!validation.success) {
        throw createHttpError(
          400,
          "Invalid service request information",
          validation.error.flatten()
        );
      }

      const payload =
        validation.data;

      const referenceImage =
        payload.referenceImage;

      if (referenceImage) {
        const trusted =
          isTrustedCustomerUpload(
            referenceImage,
            "service_request"
          );

        if (!trusted) {
          throw createHttpError(
            400,
            "The uploaded reference image is invalid"
          );
        }
      }

      const request =
        await ServiceRequest.create({
          requestNumber:
            createRequestNumber(),

          serviceType:
            payload.serviceType,

          customer:
            payload.customer,

          title:
            payload.title,

          description:
            payload.description,

          quantity:
            payload.quantity,

          budget:
            payload.budget,

          neededBy:
            payload.neededBy
              ? new Date(
                  payload.neededBy
                )
              : null,

          referenceImage:
            referenceImage || {},

          status: "new",

          statusHistory: [
            {
              from: "",
              to: "new",
              note:
                "Service request submitted",
              changedAt:
                new Date()
            }
          ]
        });

      queueServiceRequestCreatedNotifications(request);

      res.status(201).json({
        success: true,

        message:
          "Service request submitted successfully",

        request: {
          requestNumber:
            request.requestNumber,

          serviceType:
            request.serviceType,

          status:
            request.status,

          createdAt:
            request.createdAt
        }
      });
    }
  );