const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    balance: {
      type: Number,
      default: 100000,
    },

    profileImage: {
      type: String,
      default: "",
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    otpHash: {
      type: String,
      default: null,
    },

    otpExpiresAt: {
      type: Date,
      default: null,
    },

    otpPurpose: {
      type: String,
      enum: ["register", "login", null],
      default: null,
    },

    otpLastSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);