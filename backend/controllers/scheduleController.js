
const Schedule = require("../models/Schedule");
const Content = require("../models/Content");
const mongoose = require("mongoose");
const {
  deletePreviousPublishedPost,
} = require("../services/publishService");

// ======================================================
// NORMALIZE PLATFORMS
// ======================================================

const normalizePlatforms = ({
  platforms,
  platform,
}) => {
  if (
    Array.isArray(platforms) &&
    platforms.length > 0
  ) {
    if (platforms.some((item) => !["facebook", "instagram", "tiktok"].includes(item))) {
      return [];
    }
    return [
      ...new Set(
        platforms.filter((item) =>
          [
            "facebook",
            "instagram",
            "tiktok",
          ].includes(item)
        )
      ),
    ];
  }

  if (
    [
      "facebook",
      "instagram",
      "tiktok",
    ].includes(platform)
  ) {
    return [platform];
  }

  return [];
};

// ======================================================
// GET ALL
// ======================================================

const getSchedules = async (req, res) => {
  try {
    const {
      status,
      platform,
      from,
      to,
    } = req.query;

    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (platform) {
      filter.$or = [
        {
          platforms: platform,
        },
        {
          platform: platform,
        },
      ];
    }

    if (from || to) {
      filter.scheduledAt = {};

      if (from) {
        filter.scheduledAt.$gte =
          new Date(from);
      }

      if (to) {
        filter.scheduledAt.$lte =
          new Date(to);
      }
    }

    const schedules =
      await Schedule.find(filter)
        .populate({
          path: "content",
          populate: {
            path: "product",
            select:
              "name price category images",
          },
        })
        .populate(
          "createdBy",
          "name email"
        )
        .sort({
          scheduledAt: 1,
        });

    res.json({
      success: true,
      count: schedules.length,
      schedules,
    });
  } catch (error) {
    console.error(
      "Get schedules error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to fetch schedules.",
    });
  }
};

// ======================================================
// GET SINGLE
// ======================================================

const getScheduleById = async (
  req,
  res
) => {
  try {
    const schedule =
      await Schedule.findById(
        req.params.id
      )
        .populate({
          path: "content",
          populate: {
            path: "product",
            select:
              "name price category images",
          },
        })
        .populate(
          "createdBy",
          "name email"
        );

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message:
          "Schedule not found.",
      });
    }

    res.json({
      success: true,
      schedule,
    });
  } catch (error) {
    console.error(
      "Get schedule error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to fetch schedule.",
    });
  }
};

// ======================================================
// CREATE
// ======================================================

const createSchedule = async (
  req,
  res
) => {
  let createdSchedule = null;
  try {
    const {
      content,
      platforms,
      platform,
      scheduledAt,
      repeatEnabled,
      repeatEvery,
      generateNewContent,
      autoDeletePrevious,
    } = req.body;

    if (!content || !mongoose.isValidObjectId(content)) {
      return res.status(400).json({
        success: false,
        message:
          "Content is required.",
      });
    }

    const selectedPlatforms =
      normalizePlatforms({
        platforms,
        platform,
      });

    if (selectedPlatforms.includes("tiktok")) {
      return res.status(400).json({
        success: false,
        message: "TikTok publishing is not configured yet. Remove TikTok from the schedule.",
      });
    }

    if (
      selectedPlatforms.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one platform is required.",
      });
    }

    if (!scheduledAt) {
      return res.status(400).json({
        success: false,
        message:
          "Date and time are required.",
      });
    }

    if (repeatEnabled !== undefined && typeof repeatEnabled !== "boolean") {
      return res.status(400).json({ success: false, message: "repeatEnabled must be true or false." });
    }
    if (generateNewContent !== undefined && typeof generateNewContent !== "boolean") {
      return res.status(400).json({ success: false, message: "generateNewContent must be true or false." });
    }
    if (autoDeletePrevious !== undefined && typeof autoDeletePrevious !== "boolean") {
      return res.status(400).json({ success: false, message: "autoDeletePrevious must be true or false." });
    }
    if (repeatEvery !== undefined && (!Number.isInteger(Number(repeatEvery)) || Number(repeatEvery) < 1 || Number(repeatEvery) > 365)) {
      return res.status(400).json({ success: false, message: "repeatEvery must be between 1 and 365 days." });
    }

    const selectedDate =
      new Date(scheduledAt);

    if (
      Number.isNaN(
        selectedDate.getTime()
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid date and time.",
      });
    }

    if (
      selectedDate.getTime() <=
      Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Schedule date and time must be in the future.",
      });
    }

    const existingContent =
      await Content.findById(content);

    if (!existingContent) {
      return res.status(404).json({
        success: false,
        message:
          "Content not found.",
      });
    }

    if (
      ![
        "approved",
        "scheduled",
      ].includes(
        existingContent.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only approved content can be scheduled.",
      });
    }

    if (selectedPlatforms.includes("instagram") && !existingContent.media?.url) {
      return res.status(400).json({ success: false, message: "Instagram posts require an uploaded image or Reel video." });
    }
    if (existingContent.type === "reel" && existingContent.media?.resourceType !== "video") {
      return res.status(400).json({ success: false, message: "Reel content must have a video file." });
    }
    if (selectedPlatforms.includes("facebook") && !existingContent.media?.url && !existingContent.caption?.trim()) {
      return res.status(400).json({ success: false, message: "Facebook content needs a caption or media file." });
    }

    // ----------------------------------------------
    // DUPLICATE CHECK
    // ----------------------------------------------

    const duplicate =
      await Schedule.findOne({
        content,
        status: {
          $in: [
            "scheduled",
            "processing",
          ],
        },
        $or: [
          {
            platforms: {
              $in: selectedPlatforms,
            },
          },
          {
            platform: {
              $in: selectedPlatforms,
            },
          },
        ],
      });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message:
          "This content is already scheduled for one or more selected platforms.",
      });
    }

    // ----------------------------------------------
    // REPEAT
    // ----------------------------------------------

    let finalRepeatEvery =
      Number(repeatEvery);

    if (
      !Number.isInteger(
        finalRepeatEvery
      ) ||
      finalRepeatEvery < 1
    ) {
      finalRepeatEvery = 1;
    }

    // ----------------------------------------------
    // CREATE
    // ----------------------------------------------

    const schedule =
      await Schedule.create({
        content,

        platforms:
          selectedPlatforms,

        platform:
          selectedPlatforms[0],

        scheduledAt:
          selectedDate,

        repeatEnabled:
          Boolean(repeatEnabled),

        repeatEvery:
          finalRepeatEvery,

        repeatUnit: "days",

        generateNewContent:
          generateNewContent !== false,

        autoDeletePrevious:
          autoDeletePrevious !== false,

        status: "scheduled",

        createdBy:
          req.user._id,
      });
    createdSchedule = schedule;

    existingContent.status =
      "scheduled";

    await existingContent.save();

    const populatedSchedule =
      await Schedule.findById(
        schedule._id
      ).populate({
        path: "content",
        populate: {
          path: "product",
          select:
            "name price category images",
        },
      });

    res.status(201).json({
      success: true,
      message:
        "Content scheduled successfully.",
      schedule:
        populatedSchedule,
    });
  } catch (error) {
    if (createdSchedule) {
      await Schedule.findByIdAndDelete(createdSchedule._id).catch(() => {});
      await Content.findByIdAndUpdate(createdSchedule.content, { status: "approved" }).catch(() => {});
    }
    console.error(
      "Create schedule error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to create schedule.",
    });
  }
};

// ======================================================
// UPDATE
// ======================================================

const updateSchedule = async (
  req,
  res
) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid schedule ID." });
    }
    const schedule =
      await Schedule.findById(
        req.params.id
      );

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message:
          "Schedule not found.",
      });
    }

    if (schedule.status === "processing") {
      return res.status(409).json({
        success: false,
        message:
          "This schedule is currently processing.",
      });
    }
    if (!["scheduled", "failed"].includes(schedule.status)) {
      return res.status(409).json({ success: false, message: "Only scheduled or failed schedules can be edited." });
    }

    const {
      platforms,
      platform,
      scheduledAt,
      repeatEnabled,
      repeatEvery,
      generateNewContent,
      autoDeletePrevious,
    } = req.body;

    // ----------------------------------------------
    // PLATFORMS
    // ----------------------------------------------

    if (
      platforms !== undefined ||
      platform !== undefined
    ) {
      const selectedPlatforms =
        normalizePlatforms({
          platforms,
          platform,
        });

      if (selectedPlatforms.includes("tiktok")) {
        return res.status(400).json({
          success: false,
          message: "TikTok publishing is not configured yet. Remove TikTok from the schedule.",
        });
      }

      if (
        selectedPlatforms.length ===
        0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "At least one platform is required.",
        });
      }

      schedule.platforms =
        selectedPlatforms;

      schedule.platform =
        selectedPlatforms[0];
    }

    const scheduleContent = await Content.findById(schedule.content);
    if (!scheduleContent) {
      return res.status(404).json({ success: false, message: "Scheduled content no longer exists." });
    }
    const effectivePlatforms = schedule.platforms?.length
      ? schedule.platforms
      : schedule.platform ? [schedule.platform] : [];
    if (effectivePlatforms.includes("instagram") && !scheduleContent?.media?.url) {
      return res.status(400).json({ success: false, message: "Instagram posts require an uploaded image or Reel video." });
    }
    if (scheduleContent?.type === "reel" && scheduleContent.media?.resourceType !== "video") {
      return res.status(400).json({ success: false, message: "Reel content must have a video file." });
    }

    const conflict = await Schedule.findOne({
      _id: { $ne: schedule._id },
      content: schedule.content,
      status: { $in: ["scheduled", "processing"] },
      $or: [
        { platforms: { $in: effectivePlatforms } },
        { platform: { $in: effectivePlatforms } },
      ],
    });
    if (conflict) {
      return res.status(409).json({ success: false, message: "This content is already scheduled for one or more selected platforms." });
    }

    // ----------------------------------------------
    // DATE
    // ----------------------------------------------

    if (scheduledAt) {
      const selectedDate =
        new Date(scheduledAt);

      if (
        Number.isNaN(
          selectedDate.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid date and time.",
        });
      }

      if (
        selectedDate.getTime() <=
        Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Schedule date and time must be in the future.",
        });
      }

      schedule.scheduledAt =
        selectedDate;
    }

    if (
      typeof repeatEnabled ===
      "boolean"
    ) {
      schedule.repeatEnabled =
        repeatEnabled;
    }

    if (
      repeatEvery !== undefined
    ) {
      const value =
        Number(repeatEvery);

      if (
        !Number.isInteger(value) ||
        value < 1 || value > 365
      ) {
        return res.status(400).json({
          success: false,
          message:
            "repeatEvery must be a positive number.",
        });
      }

      schedule.repeatEvery =
        value;
    }

    if (
      typeof generateNewContent ===
      "boolean"
    ) {
      schedule.generateNewContent =
        generateNewContent;
    }

    if (
      typeof autoDeletePrevious ===
      "boolean"
    ) {
      schedule.autoDeletePrevious =
        autoDeletePrevious;
    }

    schedule.status =
      "scheduled";

    schedule.retryOnlyFailed = false;
    schedule.retryCount = 0;
    schedule.retryForScheduledAt = null;
    schedule.retryRecoveryApplied = false;

    schedule.errorMessage = "";

    await schedule.save();

    const updatedSchedule =
      await Schedule.findById(
        schedule._id
      ).populate({
        path: "content",
        populate: {
          path: "product",
          select:
            "name price category images",
        },
      });

    res.json({
      success: true,
      message:
        "Schedule updated successfully.",
      schedule:
        updatedSchedule,
    });
  } catch (error) {
    console.error(
      "Update schedule error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to update schedule.",
    });
  }
};

// ======================================================
// CANCEL
// ======================================================

const cancelSchedule = async (
  req,
  res
) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid schedule ID." });
    }
    const schedule =
      await Schedule.findById(
        req.params.id
      );

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message:
          "Schedule not found.",
      });
    }

    if (schedule.status === "processing") {
      return res.status(409).json({
        success: false,
        message:
          "Processing schedule cannot be cancelled.",
      });
    }
    if (!["scheduled", "failed"].includes(schedule.status)) {
      return res.status(409).json({ success: false, message: "Only scheduled or failed schedules can be cancelled." });
    }

    schedule.status =
      "cancelled";

    await schedule.save();

    const activeSchedule =
      await Schedule.findOne({
        content:
          schedule.content,

        status: {
          $in: [
            "scheduled",
            "processing",
          ],
        },
      });

    if (!activeSchedule) {
      await Content.findByIdAndUpdate(
        schedule.content,
        {
          status: "approved",
        }
      );
    }

    res.json({
      success: true,
      message:
        "Schedule cancelled successfully.",
    });
  } catch (error) {
    console.error(
      "Cancel schedule error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to cancel schedule.",
    });
  }
};

// ======================================================
// DELETE SCHEDULE AND ITS PUBLISHED POSTS
// ======================================================

const deleteSchedule =
  async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid schedule ID." });
      }
      const schedule =
        await Schedule.findById(
          req.params.id
        );

      if (!schedule) {
        return res.status(404).json({
          success: false,
          message:
            "Schedule not found.",
        });
      }

      if (schedule.status === "processing") {
        return res.status(409).json({
          success: false,
          message: "A schedule being processed cannot be deleted.",
        });
      }

      const publishedPosts = Array.isArray(schedule.publishedPosts)
        ? schedule.publishedPosts.filter((post) => post.success)
        : [];

      const deletionResults = [];
      for (const post of publishedPosts) {
        if (!post.postId) continue;

        const deletion = await deletePreviousPublishedPost({
          platform: post.platform,
          postId: post.postId,
        });

        deletionResults.push({
          platform: post.platform,
          ...deletion,
        });
      }

      const failedDeletion = deletionResults.find((item) => !item.success);
      if (failedDeletion) {
        return res.status(502).json({
          success: false,
          message: `${failedDeletion.platform} post could not be deleted from social media. ${failedDeletion.message}`,
        });
      }

      await Schedule.findByIdAndDelete(
        schedule._id
      );

      const deletedPlatforms = new Set(deletionResults.map((item) => item.platform));
      if (deletedPlatforms.size > 0) {
        const content = await Content.findById(schedule.content);
        if (content) {
          content.publishedPosts = (content.publishedPosts || []).filter(
            (post) => !deletedPlatforms.has(post.platform)
          );

          if (content.publishedPosts.length === 0) {
            content.status = "approved";
            content.publishedPostId = "";
            content.publishedUrl = "";
            content.publishedAt = null;
          }

          await content.save();
        }
      }

      res.json({
        success: true,
        message: "Schedule and its published social-media posts were deleted.",
      });
    } catch (error) {
      console.error(
        "Delete schedule error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to delete schedule.",
      });
    }
  };

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  getSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  cancelSchedule,
  deleteSchedule,
};
