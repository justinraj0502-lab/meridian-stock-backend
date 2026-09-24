const express = require("express");

const {
  register,
  verifyRegistrationOtp,
  login,
  verifyLoginOtp,
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
  "/otp/resend",
  resendOtp
);

module.exports = router;