import mongoose from "mongoose";

const referenceImageSchema =
  new mongoose.Schema(
    {
      imageUrl: {
        type: String,
        default: "",
        trim: true
      },

      imagePublicId: {
        type: String,
        default: "",
        trim: true
      },

      originalFileName: {
        type: String,
        default: "",
        trim: true
      }
    },
    {
      _id: false
    }
  );

const statusHistorySchema =
  new mongoose.Schema(
    {
      from: {
        type: String,
        default: ""
      },

      to: {
        type: String,
        required: true
      },

      note: {
        type: String,
        default: "",
        trim: true
      },

      changedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Admin",
        default: null
      },

      changedAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: true
    }
  );

const serviceRequestSchema =
  new mongoose.Schema(
    {
      requestNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true
      },

      serviceType: {
        type: String,

        enum: [
          "engraving",
          "gift_wrapping",
          "photo_printing",
          "custom_gift",
          "corporate_gifting",
          "other"
        ],

        required: true,
        index: true
      },

      customer: {
        fullName: {
          type: String,
          required: true,
          trim: true
        },

        email: {
          type: String,
          required: true,
          trim: true,
          lowercase: true,
          index: true
        },

        phone: {
          type: String,
          required: true,
          trim: true,
          index: true
        },

        whatsappNumber: {
          type: String,
          default: "",
          trim: true
        }
      },

      title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
      },

      description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000
      },

      quantity: {
        type: Number,
        default: 1,
        min: 1,
        max: 10000
      },

      budget: {
        type: Number,
        default: null,
        min: 0
      },

      neededBy: {
        type: Date,
        default: null
      },

      referenceImage: {
        type:
          referenceImageSchema,

        default: () => ({})
      },

      status: {
        type: String,

        enum: [
          "new",
          "contacted",
          "quoted",
          "approved",
          "in_progress",
          "completed",
          "cancelled"
        ],

        default: "new",
        index: true
      },

      quotedPrice: {
        type: Number,
        default: null,
        min: 0
      },

      adminNote: {
        type: String,
        default: "",
        trim: true,
        maxlength: 5000
      },

      statusHistory: {
        type:
          [statusHistorySchema],

        default: []
      }
    },
    {
      timestamps: true
    }
  );

serviceRequestSchema.index({
  createdAt: -1,
  status: 1
});

serviceRequestSchema.index({
  serviceType: 1,
  createdAt: -1
});

serviceRequestSchema.index({
  title: "text",
  description: "text",
  "customer.fullName": "text",
  "customer.email": "text"
});

const ServiceRequest =
  mongoose.models.ServiceRequest ||
  mongoose.model(
    "ServiceRequest",
    serviceRequestSchema
  );

export default ServiceRequest;