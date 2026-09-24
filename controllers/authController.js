const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/User");

const {
  sendOtpEmail,
} = require("../services/emailService");

const OTP_EXPIRY_MINUTES = 5;
const OTP_RESEND_SECONDS = 60;

const generateToken = (userId) => {
  return jwt.sign(
    {
      userId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
};

const generateOtp = () => {
  return crypto
    .randomInt(100000, 1000000)
    .toString();
};

const hashOtp = (otp) => {
  return crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");
};

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
};

const sendVerificationOtp = async (
  user,
  purpose
) => {
  const now = Date.now();

  if (user.otpLastSentAt) {
    const elapsed =
      (now -
        new Date(
          user.otpLastSentAt
        ).getTime()) /
      1000;

    if (
      elapsed < OTP_RESEND_SECONDS
    ) {
      const remaining = Math.ceil(
        OTP_RESEND_SECONDS - elapsed
      );

      const error = new Error(
        `Please wait ${remaining} seconds before requesting another OTP`
      );

      error.code = "OTP_COOLDOWN";

      throw error;
    }
  }

  const otp = generateOtp();

  user.otpHash = hashOtp(otp);

  user.otpExpiresAt = new Date(
    now +
      OTP_EXPIRY_MINUTES *
        60 *
        1000
  );

  user.otpPurpose = purpose;

  user.otpLastSentAt = new Date();

  await user.save();

  try {
    await sendOtpEmail({
      email: user.email,
      name: user.name,
      otp,
      purpose,
    });
  } catch (error) {
    user.otpHash = null;
    user.otpExpiresAt = null;
    user.otpPurpose = null;
    user.otpLastSentAt = null;

    await user.save();

    throw error;
  }
};

/* =========================================================
   REGISTER
========================================================= */

const register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
    } = req.body;

    if (
      !name ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name, email and password are required",
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const normalizedName =
      name.trim();

    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid email address",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least 6 characters",
      });
    }

    let user = await User.findOne({
      email: normalizedEmail,
    });

    if (
      user &&
      user.emailVerified
    ) {
      return res.status(409).json({
        success: false,
        message:
          "An account with this email already exists",
      });
    }

    if (user && !user.emailVerified) {
      user.name = normalizedName;

      user.password =
        await bcrypt.hash(
          password,
          10
        );
    } else {
      const hashedPassword =
        await bcrypt.hash(
          password,
          10
        );

      user = new User({
        name: normalizedName,
        email: normalizedEmail,
        password:
          hashedPassword,
        emailVerified: false,
      });
    }

    await user.save();

    await sendVerificationOtp(
      user,
      "register"
    );

    res.status(200).json({
      success: true,
      requiresVerification: true,
      message:
        "Verification code sent to your email",
      email: user.email,
    });
  } catch (error) {
    console.error(
      "Register error:",
      error
    );

    if (
      error.code ===
      "OTP_COOLDOWN"
    ) {
      return res.status(429).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message:
        "Unable to send verification code. Please try again.",
    });
  }
};

/* =========================================================
   VERIFY REGISTRATION OTP
========================================================= */

const verifyRegistrationOtp =
  async (req, res) => {
    try {
      const {
        email,
        otp,
      } = req.body;

      if (!email || !otp) {
        return res.status(400).json({
          success: false,
          message:
            "Email and OTP are required",
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "Registration session not found",
        });
      }

      if (user.emailVerified) {
        return res.status(400).json({
          success: false,
          message:
            "Email is already verified",
        });
      }

      if (
        !user.otpHash ||
        !user.otpExpiresAt ||
        user.otpPurpose !==
          "register"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "No active verification code. Please request a new OTP.",
        });
      }

      if (
        new Date() >
        new Date(
          user.otpExpiresAt
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "OTP has expired. Please request a new code.",
        });
      }

      const submittedHash =
        hashOtp(
          String(otp).trim()
        );

      if (
        submittedHash !==
        user.otpHash
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid verification code",
        });
      }

      user.emailVerified =
        true;

      user.otpHash = null;
      user.otpExpiresAt = null;
      user.otpPurpose = null;
      user.otpLastSentAt = null;

      await user.save();

      const token =
        generateToken(
          user._id
        );

      res.status(200).json({
        success: true,
        message:
          "Email verified successfully",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          balance: user.balance,
        },
      });
    } catch (error) {
      console.error(
        "Registration OTP verification error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Server error",
      });
    }
  };

/* =========================================================
   LOGIN
========================================================= */

const login = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Email and password are required",
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const user =
      await User.findOne({
        email: normalizedEmail,
      });

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password",
      });
    }

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password",
      });
    }

    if (!user.emailVerified) {
      try {
        await sendVerificationOtp(
          user,
          "register"
        );
      } catch (error) {
        if (
          error.code ===
          "OTP_COOLDOWN"
        ) {
          return res.status(429).json({
            success: false,
            message:
              error.message,
          });
        }

        throw error;
      }

      return res.status(403).json({
        success: false,
        requiresVerification: true,
        message:
          "Please verify your email before logging in.",
        email: user.email,
      });
    }

    await sendVerificationOtp(
      user,
      "login"
    );

    res.status(200).json({
      success: true,
      requiresOtp: true,
      message:
        "Login verification code sent to your email",
      email: user.email,
    });
  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    if (
      error.code ===
      "OTP_COOLDOWN"
    ) {
      return res.status(429).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message:
        "Unable to send login verification code",
    });
  }
};

/* =========================================================
   VERIFY LOGIN OTP
========================================================= */

const verifyLoginOtp =
  async (req, res) => {
    try {
      const {
        email,
        otp,
      } = req.body;

      if (!email || !otp) {
        return res.status(400).json({
          success: false,
          message:
            "Email and OTP are required",
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      if (!user.emailVerified) {
        return res.status(403).json({
          success: false,
          message:
            "Please verify your email first",
        });
      }

      if (
        !user.otpHash ||
        !user.otpExpiresAt ||
        user.otpPurpose !==
          "login"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "No active login OTP. Please login again.",
        });
      }

      if (
        new Date() >
        new Date(
          user.otpExpiresAt
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "OTP has expired. Please login again.",
        });
      }

      const submittedHash =
        hashOtp(
          String(otp).trim()
        );

      if (
        submittedHash !==
        user.otpHash
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid verification code",
        });
      }

      user.otpHash = null;
      user.otpExpiresAt = null;
      user.otpPurpose = null;
      user.otpLastSentAt = null;

      await user.save();

      const token =
        generateToken(
          user._id
        );

      res.status(200).json({
        success: true,
        message:
          "Login successful",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          balance: user.balance,
        },
      });
    } catch (error) {
      console.error(
        "Login OTP verification error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Server error",
      });
    }
  };

/* =========================================================
   FORGOT PASSWORD
========================================================= */

const forgotPassword =
  async (req, res) => {
    try {
      const { email } =
        req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message:
            "Email is required",
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      if (
        !isValidEmail(
          normalizedEmail
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter a valid email address",
        });
      }

      const user =
        await User.findOne({
          email: normalizedEmail,
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "No account found with this email",
        });
      }

      if (!user.emailVerified) {
        return res.status(403).json({
          success: false,
          message:
            "Please verify your email first",
        });
      }

      const now = Date.now();

      if (
        user.resetOtpLastSentAt
      ) {
        const elapsed =
          (now -
            new Date(
              user.resetOtpLastSentAt
            ).getTime()) /
          1000;

        if (
          elapsed <
          OTP_RESEND_SECONDS
        ) {
          const remaining =
            Math.ceil(
              OTP_RESEND_SECONDS -
                elapsed
            );

          return res.status(429).json({
            success: false,
            message:
              `Please wait ${remaining} seconds before requesting another OTP`,
          });
        }
      }

      const otp =
        generateOtp();

      user.resetOtpHash =
        hashOtp(otp);

      user.resetOtpExpiresAt =
        new Date(
          now +
            OTP_EXPIRY_MINUTES *
              60 *
              1000
        );

      user.resetOtpLastSentAt =
        new Date();

      await user.save();

      try {
        await sendOtpEmail({
          email: user.email,
          name: user.name,
          otp,
          purpose:
            "forgot-password",
        });
      } catch (error) {
        user.resetOtpHash = null;
        user.resetOtpExpiresAt =
          null;
        user.resetOtpLastSentAt =
          null;

        await user.save();

        throw error;
      }

      res.status(200).json({
        success: true,
        message:
          "Password reset code sent to your email",
        email: user.email,
      });
    } catch (error) {
      console.error(
        "Forgot password error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to send password reset code",
      });
    }
  };

/* =========================================================
   VERIFY FORGOT PASSWORD OTP
========================================================= */

const verifyForgotPasswordOtp =
  async (req, res) => {
    try {
      const {
        email,
        otp,
      } = req.body;

      if (!email || !otp) {
        return res.status(400).json({
          success: false,
          message:
            "Email and OTP are required",
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      if (
        !user.resetOtpHash ||
        !user.resetOtpExpiresAt
      ) {
        return res.status(400).json({
          success: false,
          message:
            "No active password reset code. Please request a new code.",
        });
      }

      if (
        new Date() >
        new Date(
          user.resetOtpExpiresAt
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "OTP has expired. Please request a new code.",
        });
      }

      const submittedHash =
        hashOtp(
          String(otp).trim()
        );

      if (
        submittedHash !==
        user.resetOtpHash
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid verification code",
        });
      }

      res.status(200).json({
        success: true,
        message:
          "OTP verified successfully",
      });
    } catch (error) {
      console.error(
        "Forgot password OTP verification error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Server error",
      });
    }
  };

/* =========================================================
   RESET PASSWORD
========================================================= */

const resetPassword =
  async (req, res) => {
    try {
      const {
        email,
        otp,
        newPassword,
      } = req.body;

      if (
        !email ||
        !otp ||
        !newPassword
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Email, OTP and new password are required",
        });
      }

      if (
        newPassword.length < 6
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Password must contain at least 6 characters",
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      if (
        !user.resetOtpHash ||
        !user.resetOtpExpiresAt
      ) {
        return res.status(400).json({
          success: false,
          message:
            "No active password reset code",
        });
      }

      if (
        new Date() >
        new Date(
          user.resetOtpExpiresAt
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "OTP has expired. Please request a new code.",
        });
      }

      const submittedHash =
        hashOtp(
          String(otp).trim()
        );

      if (
        submittedHash !==
        user.resetOtpHash
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid verification code",
        });
      }

      /* =====================================================
         PREVENT REUSING THE CURRENT PASSWORD
      ===================================================== */

      const samePassword =
        await bcrypt.compare(
          newPassword,
          user.password
        );

      if (samePassword) {
        return res.status(400).json({
          success: false,
          code: "PASSWORD_SAME_AS_CURRENT",
          message:
            "New password must be different from your current password.",
        });
      }

      /* =====================================================
         SAVE NEW PASSWORD
      ===================================================== */

      user.password =
        await bcrypt.hash(
          newPassword,
          10
        );

      /* =====================================================
         CONSUME PASSWORD RESET OTP
      ===================================================== */

      user.resetOtpHash = null;

      user.resetOtpExpiresAt =
        null;

      user.resetOtpLastSentAt =
        null;

      await user.save();

      res.status(200).json({
        success: true,
        message:
          "Password reset successfully",
      });
    } catch (error) {
      console.error(
        "Reset password error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to reset password",
      });
    }
  };

/* =========================================================
   RESEND OTP
========================================================= */

const resendOtp = async (
  req,
  res
) => {
  try {
    const {
      email,
      purpose,
    } = req.body;

    if (!email || !purpose) {
      return res.status(400).json({
        success: false,
        message:
          "Email and OTP purpose are required",
      });
    }

    if (
      ![
        "register",
        "login",
      ].includes(purpose)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid OTP purpose",
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const user =
      await User.findOne({
        email: normalizedEmail,
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "User not found",
      });
    }

    if (
      purpose === "register" &&
      user.emailVerified
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Email is already verified",
      });
    }

    if (
      purpose === "login" &&
      !user.emailVerified
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your email first",
      });
    }

    await sendVerificationOtp(
      user,
      purpose
    );

    res.status(200).json({
      success: true,
      message:
        "A new verification code has been sent",
      email: user.email,
    });
  } catch (error) {
    console.error(
      "Resend OTP error:",
      error
    );

    if (
      error.code ===
      "OTP_COOLDOWN"
    ) {
      return res.status(429).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message:
        "Unable to resend verification code",
    });
  }
};

module.exports = {
  register,
  verifyRegistrationOtp,
  login,
  verifyLoginOtp,
  forgotPassword,
  verifyForgotPasswordOtp,
  resetPassword,
  resendOtp,
};