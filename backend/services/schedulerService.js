
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const Schedule = require("../models/Schedule");
const Content = require("../models/Content");
const Product = require("../models/Product");
const SocialAccount = require("../models/SocialAccount");

const {
  generateFreshReelContent,
} = require("./reelContentService");

const META_GRAPH_VERSION =
  process.env.META_GRAPH_VERSION || "v24.0";

const GRAPH_BASE =
  `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/*
====================================================
HELPERS
====================================================
*/

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getFacebookAccount = async () => {
  const account = await SocialAccount.findOne({
    platform: "facebook",
    status: "connected",
  });

  if (!account) {
    throw new Error(
      "No connected Facebook account found."
    );
  }

  if (!account.accessToken) {
    throw new Error(
      "Facebook Page Access Token is missing."
    );
  }

  if (!account.pageId) {
    throw new Error(
      "Facebook Page ID is missing."
    );
  }

  return account;
};

/*
====================================================
FACEBOOK REEL
====================================================
*/

const publishFacebookReel = async ({
  pageId,
  accessToken,
  videoUrl,
  caption,
}) => {
  if (!pageId) {
    throw new Error(
      "Facebook Page ID is missing."
    );
  }

  if (!accessToken) {
    throw new Error(
      "Facebook Page Access Token is missing."
    );
  }

  if (!videoUrl) {
    throw new Error(
      "Reel video URL is missing."
    );
  }

  console.log(
    "Starting Facebook Reel upload..."
  );

  /*
  -----------------------------------------------
  STEP 1
  Start Reel upload
  -----------------------------------------------
  */

  const startResponse = await axios.post(
    `${GRAPH_BASE}/${pageId}/video_reels`,
    null,
    {
      params: {
        access_token: accessToken,
        upload_phase: "start",
      },
      timeout: 60000,
    }
  );

  const videoId =
    startResponse.data?.video_id;

  const uploadUrl =
    startResponse.data?.upload_url;

  if (!videoId) {
    throw new Error(
      "Facebook did not return a video ID."
    );
  }

  if (!uploadUrl) {
    throw new Error(
      "Facebook did not return an upload URL."
    );
  }

  console.log(
    "Facebook Reel upload session created:",
    videoId
  );

  /*
  -----------------------------------------------
  STEP 2
  Download Cloudinary video
  -----------------------------------------------
  */

  console.log(
    "Downloading Reel from Cloudinary..."
  );

  const tempDir = path.join(
    process.cwd(),
    "temp-facebook"
  );

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, {
      recursive: true,
    });
  }

  const tempFile = path.join(
    tempDir,
    `facebook-reel-${videoId}.mp4`
  );

  const videoResponse = await axios.get(
    videoUrl,
    {
      responseType: "arraybuffer",
      timeout: 120000,
      maxContentLength:
        500 * 1024 * 1024,
      maxBodyLength:
        500 * 1024 * 1024,
    }
  );

  fs.writeFileSync(
    tempFile,
    Buffer.from(videoResponse.data)
  );

  const videoStats =
    fs.statSync(tempFile);

  const videoSize =
    videoStats.size;

  console.log(
    `Video downloaded: ${videoSize} bytes`
  );

  /*
  -----------------------------------------------
  STEP 3
  Upload video to Facebook
  -----------------------------------------------
  */

  console.log(
    "Uploading Reel video to Facebook..."
  );

  const videoBuffer =
    fs.readFileSync(tempFile);

  const uploadResponse =
    await axios.post(
      uploadUrl,
      videoBuffer,
      {
        headers: {
          Authorization:
            `OAuth ${accessToken}`,

          "offset": "0",

          "file_size":
            String(videoSize),

          "Content-Type":
            "application/octet-stream",
        },

        maxContentLength:
          500 * 1024 * 1024,

        maxBodyLength:
          500 * 1024 * 1024,

        timeout: 180000,
      }
    );

  console.log(
    "Facebook video upload response:",
    uploadResponse.data
  );

  /*
  -----------------------------------------------
  STEP 4
  Finish + publish Reel
  -----------------------------------------------
  */

  console.log(
    "Publishing Facebook Reel..."
  );

  const finishResponse =
    await axios.post(
      `${GRAPH_BASE}/${pageId}/video_reels`,
      null,
      {
        params: {
          access_token: accessToken,
          video_id: videoId,
          upload_phase: "finish",
          video_state: "PUBLISHED",
          description: caption || "",
        },
        timeout: 120000,
      }
    );

  console.log(
    "Facebook Reel publish response:",
    finishResponse.data
  );

  if (
    finishResponse.data?.success !== true &&
    !finishResponse.data?.video_id
  ) {
    throw new Error(
      "Facebook Reel was not published successfully."
    );
  }

  /*
  -----------------------------------------------
  STEP 5
  Get permalink
  -----------------------------------------------
  */

  let publishedUrl = "";

  try {
    await sleep(3000);

    const detailsResponse =
      await axios.get(
        `${GRAPH_BASE}/${videoId}`,
        {
          params: {
            fields:
              "id,permalink_url",
            access_token: accessToken,
          },
          timeout: 60000,
        }
      );

    publishedUrl =
      detailsResponse.data?.permalink_url ||
      "";
  } catch (error) {
    console.log(
      "Could not get Reel permalink:",
      error.response?.data ||
        error.message
    );
  }

  /*
  -----------------------------------------------
  CLEAN TEMP FILE
  -----------------------------------------------
  */

  try {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  } catch (error) {
    console.log(
      "Temporary file cleanup failed:",
      error.message
    );
  }

  return {
    success: true,
    postId: String(videoId),
    publishedUrl,
  };
};

/*
====================================================
FACEBOOK NORMAL VIDEO / POST
====================================================
*/

const publishFacebookPost = async ({
  pageId,
  accessToken,
  videoUrl,
  caption,
}) => {
  /*
  For the current automation system we use the
  Facebook Reel endpoint for generated videos.
  */

  return publishFacebookReel({
    pageId,
    accessToken,
    videoUrl,
    caption,
  });
};

/*
====================================================
DELETE PREVIOUS FACEBOOK POST
====================================================
*/

const deletePreviousFacebookPost = async ({
  postId,
  accessToken,
}) => {
  if (!postId) {
    return {
      success: true,
      skipped: true,
      message:
        "No previous Facebook post to delete.",
    };
  }

  if (!accessToken) {
    throw new Error(
      "Facebook Page Access Token is missing."
    );
  }

  try {
    console.log(
      `Deleting previous Facebook post: ${postId}`
    );

    const response =
      await axios.delete(
        `${GRAPH_BASE}/${postId}`,
        {
          params: {
            access_token: accessToken,
          },
          timeout: 60000,
        }
      );

    console.log(
      "Previous Facebook post deleted:",
      response.data
    );

    return {
      success: true,
      deleted: true,
    };
  } catch (error) {
    const errorData =
      error.response?.data;

    console.error(
      "Facebook previous post deletion failed:",
      errorData || error.message
    );

    /*
    If the post is already deleted/not found,
    don't stop the entire scheduler.
    */

    const errorMessage =
      errorData?.error?.message ||
      error.message ||
      "";

    if (
      errorMessage
        .toLowerCase()
        .includes("not found") ||
      errorData?.error?.code === 100
    ) {
      return {
        success: true,
        deleted: false,
        alreadyGone: true,
      };
    }

    throw error;
  }
};

/*
====================================================
PUBLISH TO PLATFORM
====================================================
*/

const publishToPlatform = async ({
  platform,
  content,
  socialAccount,
}) => {
  if (!content) {
    throw new Error(
      "Content not found."
    );
  }

  if (!content.media?.url) {
    throw new Error(
      "Content does not contain a media URL."
    );
  }

  const caption =
    content.caption || "";

  /*
  -----------------------------------------------
  FACEBOOK
  -----------------------------------------------
  */

  if (platform === "facebook") {
    return publishFacebookPost({
      pageId:
        socialAccount.pageId ||
        socialAccount.accountId,

      accessToken:
        socialAccount.accessToken,

      videoUrl:
        content.media.url,

      caption,
    });
  }

  /*
  -----------------------------------------------
  INSTAGRAM
  -----------------------------------------------
  */

  if (platform === "instagram") {
    throw new Error(
      "Instagram publishing API is not connected yet."
    );
  }

  /*
  -----------------------------------------------
  TIKTOK
  -----------------------------------------------
  */

  if (platform === "tiktok") {
    throw new Error(
      "TikTok publishing API is not connected yet."
    );
  }

  throw new Error(
    `Unsupported platform: ${platform}`
  );
};

/*
====================================================
DELETE PREVIOUS PUBLISHED POST
====================================================
*/

const deletePreviousPublishedPost = async ({
  platform,
  postId,
  socialAccount,
}) => {
  if (!postId) {
    return {
      success: true,
      skipped: true,
    };
  }

  if (platform === "facebook") {
    return deletePreviousFacebookPost({
      postId,
      accessToken:
        socialAccount.accessToken,
    });
  }

  /*
  Instagram / TikTok will be added later.
  */

  return {
    success: true,
    skipped: true,
    message:
      `${platform} previous post deletion is not connected yet.`,
  };
};

/*
====================================================
CALCULATE NEXT SCHEDULE
====================================================
*/

const calculateNextSchedule = ({
  currentDate,
  repeatEvery,
  repeatUnit,
}) => {
  const nextDate =
    new Date(currentDate);

  const every =
    Number(repeatEvery) || 1;

  if (repeatUnit === "days") {
    nextDate.setDate(
      nextDate.getDate() + every
    );
  }

  return nextDate;
};

/*
====================================================
PROCESS SINGLE SCHEDULE
====================================================
*/

const processSchedule = async (
  schedule
) => {
  let lockedSchedule = null;

  try {
    /*
    -----------------------------------------------
    LOCK SCHEDULE
    -----------------------------------------------
    */

    lockedSchedule =
      await Schedule.findOneAndUpdate(
        {
          _id: schedule._id,
          status: "scheduled",
        },
        {
          $set: {
            status: "processing",
            errorMessage: "",
          },
        },
        {
          new: true,
        }
      );

    /*
    Another worker may have picked it.
    */

    if (!lockedSchedule) {
      return;
    }

    console.log(
      "======================================"
    );

    console.log(
      `Processing schedule: ${lockedSchedule._id}`
    );

    console.log(
      `Platform: ${lockedSchedule.platform}`
    );

    console.log(
      `Run number: ${
        lockedSchedule.runCount + 1
      }`
    );

    /*
    -----------------------------------------------
    LOAD CONTENT
    -----------------------------------------------
    */

    let content =
      await Content.findById(
        lockedSchedule.content
      );

    if (!content) {
      throw new Error(
        "Scheduled content not found."
      );
    }

    /*
    -----------------------------------------------
    LOAD PRODUCT
    -----------------------------------------------
    */

    const product =
      await Product.findById(
        content.product
      );

    if (!product) {
      throw new Error(
        "Product associated with content was not found."
      );
    }

    /*
    -----------------------------------------------
    FACEBOOK ACCOUNT
    -----------------------------------------------
    */

    const socialAccount =
      await SocialAccount.findOne({
        platform:
          lockedSchedule.platform,

        status: "connected",
      });

    if (!socialAccount) {
      throw new Error(
        `No connected ${lockedSchedule.platform} account found.`
      );
    }

    /*
    -----------------------------------------------
    GENERATE FRESH CONTENT
    -----------------------------------------------

    First run:
      use already approved content.

    Second+ run:
      create a fresh Reel if
      generateNewContent = true.
    */

    if (
      lockedSchedule.runCount > 0 &&
      lockedSchedule.generateNewContent
    ) {
      console.log(
        "Generating fresh content for repeat schedule..."
      );

      const newContent =
        await generateFreshReelContent({
          product,
          createdBy:
            lockedSchedule.createdBy,
          platform:
            lockedSchedule.platform,
        });

      if (!newContent) {
        throw new Error(
          "Fresh Reel generation failed."
        );
      }

      /*
      Mark old content as published
      if it wasn't already.
      */

      content =
        await Content.findById(
          newContent._id
        );

      lockedSchedule.content =
        newContent._id;

      await lockedSchedule.save();

      console.log(
        "Fresh Reel generated:",
        newContent._id
      );
    }

    /*
    -----------------------------------------------
    DELETE PREVIOUS PUBLISHED POST
    -----------------------------------------------
    */

    if (
      lockedSchedule.autoDeletePrevious &&
      lockedSchedule.previousPublishedPostId
    ) {
      console.log(
        "Auto deleting previous published post..."
      );

      await deletePreviousPublishedPost({
        platform:
          lockedSchedule.platform,

        postId:
          lockedSchedule.previousPublishedPostId,

        socialAccount,
      });
    }

    /*
    -----------------------------------------------
    PUBLISH
    -----------------------------------------------
    */

    console.log(
      "Publishing content..."
    );

    const publishResult =
      await publishToPlatform({
        platform:
          lockedSchedule.platform,

        content,

        socialAccount,
      });

    if (!publishResult?.success) {
      throw new Error(
        "Publishing failed."
      );
    }

    /*
    -----------------------------------------------
    UPDATE CONTENT
    -----------------------------------------------
    */

    content.status =
      "published";

    content.publishedPostId =
      publishResult.postId || "";

    content.publishedUrl =
      publishResult.publishedUrl || "";

    content.publishedAt =
      new Date();

    await content.save();

    /*
    -----------------------------------------------
    REPEAT SCHEDULE
    -----------------------------------------------
    */

    if (lockedSchedule.repeatEnabled) {
      const nextSchedule =
        calculateNextSchedule({
          currentDate:
            lockedSchedule.scheduledAt,

          repeatEvery:
            lockedSchedule.repeatEvery,

          repeatUnit:
            lockedSchedule.repeatUnit,
        });

      lockedSchedule.status =
        "scheduled";

      lockedSchedule.scheduledAt =
        nextSchedule;

      lockedSchedule.previousPublishedPostId =
        publishResult.postId || "";

      lockedSchedule.publishedPostId =
        publishResult.postId || "";

      lockedSchedule.publishedUrl =
        publishResult.publishedUrl || "";

      lockedSchedule.publishedAt =
        new Date();

      lockedSchedule.lastRunAt =
        new Date();

      lockedSchedule.runCount += 1;

      lockedSchedule.errorMessage =
        "";

      await lockedSchedule.save();

      console.log(
        "======================================"
      );

      console.log(
        "Published successfully."
      );

      console.log(
        "Repeat schedule created."
      );

      console.log(
        "Next run:",
        nextSchedule
      );

      console.log(
        "======================================"
      );

      return;
    }

    /*
    -----------------------------------------------
    ONE-TIME SCHEDULE
    -----------------------------------------------
    */

    lockedSchedule.status =
      "published";

    lockedSchedule.publishedPostId =
      publishResult.postId || "";

    lockedSchedule.publishedUrl =
      publishResult.publishedUrl || "";

    lockedSchedule.publishedAt =
      new Date();

    lockedSchedule.lastRunAt =
      new Date();

    lockedSchedule.runCount += 1;

    lockedSchedule.errorMessage =
      "";

    await lockedSchedule.save();

    console.log(
      "======================================"
    );

    console.log(
      "Schedule published successfully."
    );

    console.log(
      "======================================"
    );
  } catch (error) {
    console.error(
      "======================================"
    );

    console.error(
      "SCHEDULE PROCESSING FAILED"
    );

    console.error(
      error.response?.data ||
        error.message
    );

    console.error(
      "======================================"
    );

    /*
    -----------------------------------------------
    MARK FAILED
    -----------------------------------------------
    */

    if (lockedSchedule) {
      lockedSchedule.status =
        "failed";

      lockedSchedule.errorMessage =
        error.response?.data?.error?.message ||
        error.message ||
        "Schedule processing failed.";

      lockedSchedule.lastRunAt =
        new Date();

      await lockedSchedule.save();
    }
  }
};

/*
====================================================
PROCESS ALL DUE SCHEDULES
====================================================
*/

const processDueSchedules = async () => {
  try {
    const now = new Date();

    const schedules =
      await Schedule.find({
        status: "scheduled",
        scheduledAt: {
          $lte: now,
        },
      })
        .sort({
          scheduledAt: 1,
        })
        .limit(10);

    if (!schedules.length) {
      return;
    }

    console.log(
      `Found ${schedules.length} due schedule(s).`
    );

    for (const schedule of schedules) {
      await processSchedule(
        schedule
      );
    }
  } catch (error) {
    console.error(
      "processDueSchedules error:",
      error.message
    );
  }
};

module.exports = {
  processDueSchedules,
  processSchedule,
  publishToPlatform,
  deletePreviousPublishedPost,
};

