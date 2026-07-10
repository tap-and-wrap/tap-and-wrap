import mongoose from "mongoose";

import ServiceRequest from "../models/ServiceRequest.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  createHttpError
} from "../utils/httpError.js";

import {
  escapeRegex
} from "../utils/slug.js";

import {
  updateAdminServiceRequestSchema
} from "../validators/serviceRequest.validator.js";

import {
  queueServiceRequestStatusNotification
} from "../services/notification.service.js";

const STATUS_TRANSITIONS = {
  new: [
    "contacted",
    "quoted",
    "cancelled"
  ],

  contacted: [
    "quoted",
    "approved",
    "cancelled"
  ],

  quoted: [
    "contacted",
    "approved",
    "cancelled"
  ],

  approved: [
    "in_progress",
    "cancelled"
  ],

  in_progress: [
    "completed",
    "cancelled"
  ],

  completed: [],

  cancelled: []
};

function getPagination(query) {
  const page = Math.max(
    Number.parseInt(
      query.page,
      10
    ) || 1,
    1
  );

  const limit = Math.min(
    Math.max(
      Number.parseInt(
        query.limit,
        10
      ) || 20,
      1
    ),
    100
  );

  return {
    page,
    limit,
    skip:
      (page - 1) * limit
  };
}

function createRequestLookup(id) {
  const value = String(
    id || ""
  ).trim();

  if (!value) {
    throw createHttpError(
      400,
      "Service request identifier is required"
    );
  }

  if (
    mongoose.Types.ObjectId.isValid(
      value
    )
  ) {
    return {
      $or: [
        {
          _id: value
        },
        {
          requestNumber: value
        }
      ]
    };
  }

  return {
    requestNumber: value
  };
}

export const listAdminServiceRequests =
  asyncHandler(
    async (req, res) => {
      const {
        page,
        limit,
        skip
      } = getPagination(
        req.query
      );

      const filter = {};

      const search = String(
        req.query.search || ""
      ).trim();

      const status = String(
        req.query.status || "all"
      ).trim();

      const serviceType = String(
        req.query.serviceType ||
          "all"
      ).trim();

      if (
        status &&
        status !== "all"
      ) {
        filter.status = status;
      }

      if (
        serviceType &&
        serviceType !== "all"
      ) {
        filter.serviceType =
          serviceType;
      }

      if (search) {
        const expression =
          new RegExp(
            escapeRegex(search),
            "i"
          );

        filter.$or = [
          {
            requestNumber:
              expression
          },

          {
            title:
              expression
          },

          {
            "customer.fullName":
              expression
          },

          {
            "customer.email":
              expression
          },

          {
            "customer.phone":
              expression
          }
        ];
      }

      const [
        requests,
        total
      ] = await Promise.all([
        ServiceRequest.find(
          filter
        )
          .sort({
            createdAt: -1
          })
          .skip(skip)
          .limit(limit)
          .select(
            "requestNumber serviceType customer title quantity budget neededBy status quotedPrice createdAt updatedAt referenceImage"
          )
          .lean(),

        ServiceRequest.countDocuments(
          filter
        )
      ]);

      const totalPages =
        Math.max(
          Math.ceil(
            total / limit
          ),
          1
        );

      res.status(200).json({
        success: true,
        requests,

        pagination: {
          page,
          limit,
          total,
          totalPages,

          hasPreviousPage:
            page > 1,

          hasNextPage:
            page < totalPages
        }
      });
    }
  );

export const getAdminServiceRequest =
  asyncHandler(
    async (req, res) => {
      const request =
        await ServiceRequest.findOne(
          createRequestLookup(
            req.params.id
          )
        )
          .populate({
            path:
              "statusHistory.changedBy",

            select:
              "name email"
          })
          .lean();

      if (!request) {
        throw createHttpError(
          404,
          "Service request was not found"
        );
      }

      res.status(200).json({
        success: true,
        request
      });
    }
  );

export const updateAdminServiceRequest =
  asyncHandler(
    async (req, res) => {
      const validation =
        updateAdminServiceRequestSchema.safeParse(
          req.body
        );

      if (!validation.success) {
        throw createHttpError(
          400,
          "Invalid service request update",
          validation.error.flatten()
        );
      }

      const request =
        await ServiceRequest.findOne(
          createRequestLookup(
            req.params.id
          )
        );

      if (!request) {
        throw createHttpError(
          404,
          "Service request was not found"
        );
      }

      const {
        status,
        quotedPrice,
        adminNote,
        statusNote
      } = validation.data;

      const previousStatus =
        request.status;

      if (
        status !==
        previousStatus
      ) {
        const allowedStatuses =
          STATUS_TRANSITIONS[
            previousStatus
          ] || [];

        if (
          !allowedStatuses.includes(
            status
          )
        ) {
          throw createHttpError(
            400,
            `Service request cannot move from ${previousStatus} to ${status}`
          );
        }
      }

      if (
        status === "quoted" &&
        quotedPrice === null
      ) {
        throw createHttpError(
          400,
          "Enter the quoted price before marking the request as quoted"
        );
      }

      request.status = status;
      request.quotedPrice =
        quotedPrice;
      request.adminNote =
        adminNote;

      if (
        previousStatus !==
        status
      ) {
        request.statusHistory.push(
          {
            from:
              previousStatus,

            to:
              status,

            note:
              statusNote ||
              adminNote,

            changedBy:
              req.admin._id,

            changedAt:
              new Date()
          }
        );
      }

      await request.save();

      queueServiceRequestStatusNotification({
        request,
        previousStatus
      });

      res.status(200).json({
        success: true,

        message:
          "Service request updated successfully",

        request
      });
    }
  );