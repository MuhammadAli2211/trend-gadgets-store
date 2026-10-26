const mongoose = require("mongoose");

const analyticsSchema = new mongoose.Schema(
{
platform: {
type: String,
enum: [
"facebook",
"instagram",
"tiktok",
"website",
"whatsapp",
"other",
],
default: "other",
},


productId: {
  type: String,
  default: "",
},

contentId: {
  type: String,
  default: "",
},

publishedAt: {
  type: Date,
  default: null,
},

views: {
  type: Number,
  default: 0,
},

likes: {
  type: Number,
  default: 0,
},

comments: {
  type: Number,
  default: 0,
},

shares: {
  type: Number,
  default: 0,
},

clicks: {
  type: Number,
  default: 0,
},

whatsappClicks: {
  type: Number,
  default: 0,
},

buyNowClicks: {
  type: Number,
  default: 0,
},


},
{
timestamps: true,
}
);

module.exports = mongoose.model(
"Analytics",
analyticsSchema
);
