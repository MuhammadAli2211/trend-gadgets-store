const mongoose = require("mongoose");

const oauthStateSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["facebook", "instagram"],
      required: true,
    },
    stateHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("OAuthState", oauthStateSchema);
