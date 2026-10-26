const express = require("express");
const upload = require("../config/contentMulter");

const {
  getContent,
  getContentById,
  createContent,
  updateContent,
  updateContentStatus,
  setContentArchived,
  deleteContent,
  generateProductReel,
} = require("../controllers/contentController");

const {
  protect,
  adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(adminOnly);

router.post(
  "/generate-reel/:productId",
  generateProductReel
);

router.get("/", getContent);

router.get("/:id", getContentById);

router.post(
  "/",
  upload.single("media"),
  createContent
);

router.put(
  "/:id",
  upload.single("media"),
  updateContent
);

router.put(
  "/:id/status",
  updateContentStatus
);

router.put("/:id/archive", setContentArchived);

router.delete("/:id", deleteContent);

module.exports = router;
