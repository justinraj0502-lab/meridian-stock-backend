const User = require("../models/User");

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password"
    );

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Profile error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load profile",
    });
  }
};

module.exports = {
  getProfile,
};