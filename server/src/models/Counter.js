import mongoose from "mongoose";

const counterSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true
    },

    sequence: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    versionKey: false
  }
);

const Counter =
  mongoose.models.Counter ||
  mongoose.model("Counter", counterSchema);

export default Counter;