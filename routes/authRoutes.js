const express = require("express");

const {
  register,
  verifyRegistrationOtp,
  login,
  verifyLoginOtp,
  forgotPassword,
  verifyForgotPasswordOtp,
  resetPassword,
  resendOtp,
} = require("../controllers/authController");

const router = express.Router();

router.post(
  "/register",
  register
);

router.post(
  "/register/verify",
  verifyRegistrationOtp
);

router.post(
  "/login",
  login
);

router.post(
  "/login/verify",
  verifyLoginOtp
);

router.post(
  "/forgot-password",
  forgotPassword
);

router.post(
  "/forgot-password/verify",
  verifyForgotPasswordOtp
);

router.post(
  "/forgot-password/reset",
  resetPassword
);

router.post(
  "/otp/resend",
  resendOtp
);

module.exports = router;