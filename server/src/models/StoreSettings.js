import mongoose from "mongoose";

const storeSettingsSchema =
  new mongoose.Schema(
    {
      singletonKey: {
        type: String,
        default: "default",
        unique: true,
        immutable: true,
        index: true
      },

      contact: {
        whatsappNumber: {
          type: String,
          required: true,
          trim: true,
          maxlength: 40
        }
      },

      shipping: {
        cairoAndGiza: {
          type: Number,
          required: true,
          min: 0,
          max: 10000
        },

        otherGovernorates: {
          type: Number,
          required: true,
          min: 0,
          max: 10000
        }
      },

      paymentMethods: {
        cod: {
          enabled: {
            type: Boolean,
            default: true
          }
        },

        instapay: {
          enabled: {
            type: Boolean,
            default: false
          },

          handle: {
            type: String,
            default: "",
            trim: true,
            maxlength: 150
          }
        },

        vodafoneCash: {
          enabled: {
            type: Boolean,
            default: false
          },

          number: {
            type: String,
            default: "",
            trim: true,
            maxlength: 40
          }
        },

        card: {
          enabled: {
            type: Boolean,
            default: false
          }
        }
      },

      inventory: {
        lowStockThreshold: {
          type: Number,
          required: true,
          min: 0,
          max: 100000
        }
      },

      updatedBy: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: "Admin",
        default: null
      }
    },
    {
      timestamps: true
    }
  );

const StoreSettings =
  mongoose.models.StoreSettings ||
  mongoose.model(
    "StoreSettings",
    storeSettingsSchema
  );

export default StoreSettings;
