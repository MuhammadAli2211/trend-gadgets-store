
const Schedule = require("../models/Schedule");
const Content = require("../models/Content");
const mongoose = require("mongoose");
const axios = require("axios");
const directHttp = axios.create({ proxy: false, timeout: 8_000 });
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

    res.set("Cache-Control", "no-store");
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

        generateNewContent: false,

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

    schedule.generateNewContent = false;

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

const resolveFacebookReelId = async (rawUrl) => {
  let currentUrl;
  try {
    currentUrl = new URL(String(rawUrl || ""));
  } catch {
    throw new Error("Enter a valid Facebook Reel link.");
  }

  const isFacebookHost = (hostname) =>
    hostname === "facebook.com" || hostname.endsWith(".facebook.com") || hostname === "fb.watch";
  const getReelIdFromUrl = (url) => {
    const match = url.match(/\/(?:reel|videos)\/(\d+)(?:\/|$)/i);
    if (match) return match[1];
    const id = new URL(url).searchParams.get("v");
    return id && /^\d+$/.test(id) ? id : "";
  };

  if (!isFacebookHost(currentUrl.hostname)) throw new Error("The link must belong to Facebook.");

  for (let redirect = 0; redirect <= 5; redirect += 1) {
    const directId = getReelIdFromUrl(currentUrl.href);
    if (directId) return directId;

    let response;
    try {
      response = await directHttp.get(currentUrl.href, {
        maxRedirects: 0,
        timeout: 8000,
        responseType: "text",
        maxContentLength: 1_000_000,
        validateStatus: () => true,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TrendGadgetsAdmin/1.0)" },
      });
    } catch (error) {
      throw new Error(`Facebook link could not be checked: ${error.message}`);
    }

    const location = response.headers?.location;
    if (response.status >= 300 && response.status < 400 && location) {
      currentUrl = new URL(location, currentUrl);
      if (!isFacebookHost(currentUrl.hostname)) throw new Error("Facebook link redirected outside Facebook.");
      continue;
    }

    const html = String(response.data || "").replace(/&amp;/g, "&");
    const candidates = [
      ...html.matchAll(/<meta[^>]+(?:property|name)=["']og:url["'][^>]+content=["']([^"']+)["']/gi),
      ...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi),
    ];
    for (const match of candidates) {
      try {
        const canonical = new URL(match[1], currentUrl);
        if (isFacebookHost(canonical.hostname)) {
          const canonicalId = getReelIdFromUrl(canonical.href);
          if (canonicalId) return canonicalId;
        }
      } catch {
        // Ignore malformed metadata and keep checking the page.
      }
    }
    const escapedId = html.match(/facebook\.com\\?\/?reel\\?\/(\d+)/i)?.[1];
    if (escapedId) return escapedId;
    throw new Error("Could not identify the Reel from that link. Use its direct Facebook /reel/ link.");
  }

  throw new Error("Facebook link redirected too many times.");
};

const retryInstagramForSchedule = async (req, res) => {
  try {
    const facebookPermalink = String(req.body?.facebookPermalink || "").trim();
    const facebookReelId = await resolveFacebookReelId(facebookPermalink);
    const schedule = await Schedule.findById(req.params.id).populate("content");

    if (!schedule || !schedule.content) {
      return res.status(404).json({ success: false, message: "Schedule or its content was not found." });
    }

    const platforms = Array.isArray(schedule.platforms) && schedule.platforms.length
      ? schedule.platforms
      : [schedule.platform].filter(Boolean);
    if (!platforms.includes("facebook") || !platforms.includes("instagram")) {
      return res.status(400).json({ success: false, message: "This recovery is only for schedules targeting Facebook and Instagram." });
    }

    // Use the current lock time, not the original retry-cycle start. The
    // latter can make an actively running Instagram retry appear stale.
    const startedAt = schedule.lastRunAt;
    const minimumStuckMs = 6 * 60 * 1000;
    if (!startedAt || Date.now() - new Date(startedAt).getTime() < minimumStuckMs) {
      return res.status(409).json({ success: false, message: "This schedule may still be running. Try again after it has been stuck for 6 minutes." });
    }
    if (!["processing", "failed"].includes(schedule.status)) {
      return res.status(409).json({ success: false, message: "This schedule is no longer in a recoverable state." });
    }

    const existingPosts = Array.isArray(schedule.publishedPosts)
      ? schedule.publishedPosts.map((post) => post.toObject?.() || post)
      : [];
    const runStartedAt = new Date(startedAt);
    if (existingPosts.some((post) => {
      if (post.platform !== "instagram" || !post.success) return false;
      const attemptedAt = post.attemptedAt || post.publishedAt;
      return attemptedAt && new Date(attemptedAt) >= runStartedAt;
    })) {
      return res.status(409).json({ success: false, message: "Instagram is already marked as published. No retry was made." });
    }

    const now = new Date();
    const originalScheduledAt = schedule.retryForScheduledAt || schedule.scheduledAt;
    schedule.publishedPosts = [
      ...existingPosts.filter((post) => !["facebook", "instagram"].includes(post.platform)),
      {
        platform: "facebook",
        postId: facebookReelId,
        publishedUrl: facebookPermalink,
        publishedAt: now,
        attemptedAt: now,
        attempting: false,
        success: true,
        error: "",
      },
      {
        platform: "instagram",
        postId: "",
        publishedUrl: "",
        publishedAt: null,
        attemptedAt: now,
        attempting: false,
        success: false,
        error: "Instagram retry queued after confirmed Facebook Reel.",
      },
    ];
    schedule.currentRunStartedAt = now;
    schedule.lastRunAt = now;
    schedule.retryForScheduledAt = originalScheduledAt;
    schedule.retryOnlyFailed = true;
    schedule.retryCount = 0;
    schedule.retryRecoveryApplied = true;
    schedule.scheduledAt = new Date(Date.now() + 30 * 1000);
    schedule.status = "scheduled";
    schedule.errorMessage = "Facebook is confirmed. Instagram only will be retried.";
    await schedule.save();

    const content = await Content.findById(schedule.content._id);
    if (content) {
      content.publishedPosts = (content.publishedPosts || []).filter((post) => post.platform !== "facebook");
      content.publishedPosts.push({
        platform: "facebook",
        postId: facebookReelId,
        publishedUrl: facebookPermalink,
        publishedAt: now,
      });
      content.publishedPostId = facebookReelId;
      content.publishedUrl = facebookPermalink;
      content.publishedAt = now;
      content.status = "published";
      await content.save();
    }

    return res.json({
      success: true,
      message: "Facebook was recorded as published. Instagram only is queued for retry.",
      scheduleId: schedule._id,
    });
  } catch (error) {
    console.error("Instagram-only schedule recovery error:", error.message);
    return res.status(400).json({ success: false, message: error.message || "Unable to retry Instagram." });
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
  retryInstagramForSchedule,
};
