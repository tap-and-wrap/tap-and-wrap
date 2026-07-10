import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Admin name is required"],
      trim: true,
      maxlength: [
        100,
        "Admin name cannot exceed 100 characters"
      ]
    },

    email: {
      type: String,
      required: [true, "Admin email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },

    password: {
      type: String,
      required: [true, "Admin password is required"],
      minlength: [
        10,
        "Admin password must be at least 10 characters"
      ],
      select: false
    },

    role: {
      type: String,
      enum: ["owner", "admin"],
      default: "admin"
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

adminSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) {
    return;
  }

  this.password = await bcrypt.hash(
    this.password,
    12
  );
});

adminSchema.methods.comparePassword =
  async function comparePassword(
    candidatePassword
  ) {
    return bcrypt.compare(
      candidatePassword,
      this.password
    );
  };

adminSchema.methods.toSafeObject =
  function toSafeObject() {
    return {
      _id: this._id,
      name: this.name,
      email: this.email,
      role: this.role,
      isActive: this.isActive,
      lastLoginAt: this.lastLoginAt,
      createdAt: this.createdAt
    };
  };

const Admin =
  mongoose.models.Admin ||
  mongoose.model(
    "Admin",
    adminSchema
  );

export default Admin;