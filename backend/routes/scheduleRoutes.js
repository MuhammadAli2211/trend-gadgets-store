
const express = require("express");

const {
  getSchedules,
  getScheduleById,
} = require("../controllers/scheduleController");

const {
  protect,
  adminOnly,
} = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(adminOnly);

// GET ALL
router.get("/", getSchedules);

// GET SINGLE
router.get("/:id", getScheduleById);

module.exports = router;
  
