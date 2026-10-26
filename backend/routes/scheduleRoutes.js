
const express = require("express");

const {
  getSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  cancelSchedule,
  deleteSchedule,
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

// GET SINGLE
router.get("/:id", getScheduleById);

// UPDATE
router.put("/:id", updateSchedule);

// CANCEL
router.put("/:id/cancel", cancelSchedule);

// DELETE SCHEDULE AND ITS PUBLISHED SOCIAL POSTS
router.delete("/:id", deleteSchedule);

module.exports = router;
  
