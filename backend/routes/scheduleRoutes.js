
const express = require("express");

const {
  getSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  cancelSchedule,
  deleteSchedule,
  retryInstagramForSchedule,
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

// CREATE
router.post("/", createSchedule);

// Retry Instagram only after an interrupted Facebook + Instagram publish.
router.post("/:id/retry-instagram", retryInstagramForSchedule);

// GET SINGLE
router.get("/:id", getScheduleById);

// UPDATE
router.put("/:id", updateSchedule);

// CANCEL
router.put("/:id/cancel", cancelSchedule);

// DELETE SCHEDULE AND ITS PUBLISHED SOCIAL POSTS
router.delete("/:id", deleteSchedule);

module.exports = router;
  
