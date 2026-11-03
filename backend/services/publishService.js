
const axios = require("axios");
const graphApi = axios.create({ timeout: 15_000 });

const Schedule = require("../models/Schedule");
const Content = require("../models/Content");
const Product = require("../models/Product");
const SocialAccount = require("../models/SocialAccount");
const { ensureAutomaticSchedules } = require("./automaticScheduleService");
const { getProductVideoAsset } = require("../utils/productVideo");

const {
  generateProductImageReelAsset,
  deleteGeneratedReelAsset,
} = require("./reelContentService");

const META_GRAPH_VERSION =
  process.env.META_GRAPH_VERSION || "v24.0";

const META_LOGIN_CONFIG_ID =
  process.env.META_LOGIN_CONFIG_ID;

const META_GRAPH_BASE =
  `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const INSTAGRAM_GRAPH_BASE =
  `https://graph.instagram.com/${META_GRAPH_VERSION}`;

const getInstagramGraphBase = (account) =>
  account?.tokenType === "facebook_login" ? META_GRAPH_BASE : INSTAGRAM_GRAPH_BASE;

// ======================================================
// HELPERS
// ======================================================

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

// ======================================================
// GET PLATFORMS
// ======================================================

const getSchedulePlatforms = (schedule) => {
  if (
    Array.isArray(schedule.platforms) &&
    schedule.platforms.length > 0
  ) {
    return [
      ...new Set(
        schedule.platforms.filter((platform) =>
          ["facebook", "instagram", "tiktok"].includes(platform)
        )
      ),
    ];
  }

  if (["facebook", "instagram", "tiktok"].includes(schedule.platform)) {
    return [schedule.platform];
  }

  return [];
};

// ======================================================
// FACEBOOK ACCOUNT
// ======================================================

const getFacebookAccount = async () => {
  const account =
    await SocialAccount.findOne({
      platform: "facebook",
      status: "connected",
      accessToken: {
        $exists: true,
        $ne: "",
      },
    }).sort({
      updatedAt: -1,
    });

  if (!account) {
    throw new Error(
      "Facebook account is not connected."
    );
  }

  const pageId =
    account.pageId ||
    account.accountId;

  if (!pageId) {
    throw new Error(
      "Facebook Page ID is missing."
    );
  }

  if (!account.accessToken) {
    throw new Error(
      "Facebook Page access token is missing."
    );
  }

  return {
    account,
    pageId,
    accessToken:
      account.accessToken,
  };
};

// ======================================================
// INSTAGRAM ACCOUNT
// ======================================================

const getInstagramAccount =
  async () => {
    const account =
      await SocialAccount.findOne({
        platform: "instagram",
        status: "connected",
        accessToken: {
          $exists: true,
          $ne: "",
        },
      }).sort({
        updatedAt: -1,
      });

    if (!account) {
      throw new Error(
        "Instagram account is not connected."
      );
    }

    const instagramAccountId =
      account.instagramAccountId ||
      account.accountId;

    if (!instagramAccountId) {
      throw new Error(
        "Instagram account ID is missing."
      );
    }

    if (!account.accessToken) {
      throw new Error(
        "Instagram access token is missing."
      );
    }

    return {
      account,
      instagramAccountId:
        String(instagramAccountId),
      accessToken:
        account.accessToken,
    };
  };

// ======================================================
// VERIFY INSTAGRAM ACCOUNT
// ======================================================

const verifyInstagramAccount =
  async ({
    instagramAccountId,
    accessToken,
    graphBase = INSTAGRAM_GRAPH_BASE,
  }) => {
    try {
      const response =
        await graphApi.get(
          `${graphBase}/${instagramAccountId}`,
          {
            params: {
              fields:
                "id,username,name",

              access_token:
                accessToken,
            },
          }
        );

      console.log(
        "Instagram account verified:",
        response.data
      );

      return response.data;
    } catch (error) {
      throw formatMetaError(
        error,
        "Instagram account verification failed"
      );
    }
  };

// ======================================================
// FACEBOOK REEL
// ======================================================

const publishFacebookReel =
  async ({
    content,
    account,
  }) => {
    const pageId =
      account.pageId ||
      account.accountId;

    const accessToken =
      account.accessToken;

    const videoUrl =
      content?.media?.url;

    if (!videoUrl) {
      throw new Error(
        "Reel video URL is missing."
      );
    }

    console.log(
      "Publishing Facebook Reel..."
    );

    // ----------------------------------------------
    // START
    // ----------------------------------------------

    let startResponse;

    try {
      startResponse =
        await graphApi.post(
          `${META_GRAPH_BASE}/${pageId}/video_reels`,
          null,
          {
            params: {
              upload_phase:
                "start",

              access_token:
                accessToken,
            },
          }
        );
    } catch (error) {
      throw formatMetaError(
        error,
        "Facebook Reel start failed"
      );
    }

    const videoId =
      startResponse?.data?.video_id;

    const uploadUrl =
      startResponse?.data?.upload_url;

    if (!videoId) {
      throw new Error(
        "Facebook did not return video_id."
      );
    }

    if (!uploadUrl) {
      throw new Error(
        "Facebook did not return upload_url."
      );
    }

    console.log(
      "Facebook video ID:",
      videoId
    );

    // ----------------------------------------------
    // DOWNLOAD CLOUDINARY VIDEO
    // ----------------------------------------------

    let videoResponse;

    try {
      videoResponse =
        await graphApi.get(
          videoUrl,
          {
            responseType:
              "arraybuffer",
            timeout: 180_000,
          }
        );
    } catch (error) {
      throw new Error(
        `Unable to download Reel from Cloudinary: ${error.message}`
      );
    }

    const videoBuffer =
      Buffer.from(
        videoResponse.data
      );

    // ----------------------------------------------
    // UPLOAD TO FACEBOOK
    // ----------------------------------------------

    try {
      await graphApi.post(
        uploadUrl,
        videoBuffer,
        {
          headers: {
            Authorization:
              `OAuth ${accessToken}`,

            offset:
              "0",

            file_size:
              videoBuffer.length,

            "Content-Type":
              "application/octet-stream",
          },

          maxContentLength:
            Infinity,

          maxBodyLength:
            Infinity,

          timeout:
            180_000,
        }
      );
    } catch (error) {
      throw formatMetaError(
        error,
        "Facebook Reel upload failed"
      );
    }

    // ----------------------------------------------
    // FINISH / PUBLISH
    // ----------------------------------------------

    try {
      await graphApi.post(
        `${META_GRAPH_BASE}/${pageId}/video_reels`,
        null,
        {
          params: {
            upload_phase:
              "finish",

            video_id:
              videoId,

            video_state:
              "PUBLISHED",

            description:
              content.caption || "",

            access_token:
              accessToken,
          },
        }
      );
    } catch (error) {
      throw formatMetaError(
        error,
        "Facebook Reel publish failed"
      );
    }

    console.log(
      "Facebook Reel published:",
      videoId
    );

    // ----------------------------------------------
// GET FACEBOOK PERMALINK
// ----------------------------------------------

let publishedUrl = "";

try {
  await sleep(5000);

  console.log(
    "Checking Facebook Reel permalink..."
  );

  const result =
    await graphApi.get(
      `${META_GRAPH_BASE}/${videoId}`,
      {
        params: {
          fields:
            "id,permalink_url,short_form_video_context",

          access_token:
            accessToken,
        },
      }
    );

  console.log(
    "Facebook permalink response:",
    JSON.stringify(
      result.data,
      null,
      2
    )
  );

  publishedUrl =
    result?.data?.permalink_url ||
    "";

} catch (error) {
  console.log(
    "Facebook permalink lookup warning:",
    error?.response?.data ||
      error.message
  );
}

// ----------------------------------------------
// FACEBOOK REEL FALLBACK
// ----------------------------------------------

if (!publishedUrl) {
  publishedUrl =
    `https://www.facebook.com/reel/${videoId}`;

  console.log(
    "Facebook Reel fallback URL:",
    publishedUrl
  );
}

console.log(
  "Facebook final published URL:",
  publishedUrl
);

    // ----------------------------------------------
    // RETURN FACEBOOK RESULT
    // ----------------------------------------------

    return {
      success: true,

      postId:
        videoId,

      publishedUrl,
    };
  };

const publishFacebookVideo = async ({ content, account }) => {
  const pageId = account.pageId || account.accountId;
  const videoUrl = content?.media?.url;
  if (!videoUrl) throw new Error("Facebook video URL is missing.");
  try {
    const response = await graphApi.post(
      `${META_GRAPH_BASE}/${pageId}/videos`,
      null,
      { params: { file_url: videoUrl, description: content.caption || "", access_token: account.accessToken } }
    );
    const videoId = response.data?.id;
    if (!videoId) throw new Error("Facebook did not return a video ID.");
    return {
      success: true,
      postId: videoId,
      publishedUrl: `https://www.facebook.com/${pageId}/videos/${videoId}`,
    };
  } catch (error) {
    throw formatMetaError(error, "Facebook video publish failed");
  }
};

const lookupPublishedUrl = async (baseUrl, postId, accessToken) => {
  try {
    const response = await graphApi.get(`${baseUrl}/${postId}`, {
      params: { fields: "id,permalink_url,permalink", access_token: accessToken },
    });
    return response.data?.permalink_url || response.data?.permalink || "";
  } catch {
    return "";
  }
};

const publishFacebookPhoto = async ({ content, account }) => {
  const pageId = account.pageId || account.accountId;
  if (!pageId || !account.accessToken || !content?.media?.url) {
    throw new Error("Facebook Page, access token, or image is missing.");
  }
  try {
    const response = await graphApi.post(`${META_GRAPH_BASE}/${pageId}/photos`, null, {
      params: {
        url: content.media.url,
        caption: content.caption || "",
        access_token: account.accessToken,
      },
    });
    const postId = response.data?.post_id || response.data?.id;
    if (!postId) throw new Error("Facebook did not return a photo post ID.");
    return {
      success: true,
      postId,
      publishedUrl: await lookupPublishedUrl(META_GRAPH_BASE, postId, account.accessToken),
    };
  } catch (error) {
    throw formatMetaError(error, "Facebook photo post failed");
  }
};

const publishFacebookText = async ({ content, account }) => {
  const pageId = account.pageId || account.accountId;
  if (!pageId || !account.accessToken || !content?.caption?.trim()) {
    throw new Error("A Facebook Page, access token, and caption are required.");
  }
  try {
    const response = await graphApi.post(`${META_GRAPH_BASE}/${pageId}/feed`, null, {
      params: { message: content.caption, access_token: account.accessToken },
    });
    const postId = response.data?.id;
    if (!postId) throw new Error("Facebook did not return a post ID.");
    return {
      success: true,
      postId,
      publishedUrl: await lookupPublishedUrl(META_GRAPH_BASE, postId, account.accessToken),
    };
  } catch (error) {
    throw formatMetaError(error, "Facebook text post failed");
  }
};

// ======================================================
// INSTAGRAM REEL
// ======================================================

const publishInstagramReel =
  async ({
    content,
    account,
    mediaType = "REELS",
  }) => {
    const instagramAccountId =
      account.instagramAccountId ||
      account.accountId;

    const accessToken =
      account.accessToken;
    const graphBase = getInstagramGraphBase(account);

    const videoUrl =
      content?.media?.url;

    if (!videoUrl) {
      throw new Error(
        "Reel video URL is missing."
      );
    }

    if (!instagramAccountId) {
      throw new Error(
        "Instagram account ID is missing."
      );
    }

    if (!accessToken) {
      throw new Error(
        "Instagram access token is missing."
      );
    }

    console.log(
      "======================================"
    );

    console.log(
      "Publishing Instagram Reel..."
    );

    console.log(
      "Instagram Account ID:",
      instagramAccountId
    );

    console.log(
      "Video URL:",
      videoUrl
    );

    console.log(
      "======================================"
    );

    // ----------------------------------------------
    // VERIFY ACCOUNT
    // ----------------------------------------------

    await verifyInstagramAccount({
      instagramAccountId,
      accessToken,
      graphBase,
    });

    let audioConfiguration = null;
    if (account.tokenType === "facebook_login" && account.instagramAudioAccessToken) {
      try {
        const audioResponse = await graphApi.get(`${META_GRAPH_BASE}/ig_audio`, {
          params: {
            audio_type: "music",
            access_token: account.instagramAudioAccessToken,
          },
        });
        const track = audioResponse.data?.data?.find((item) => item?.id || item?.audio_id);
        const audioId = track?.id || track?.audio_id;
        if (audioId) {
          audioConfiguration = JSON.stringify({
            audio_id: String(audioId),
            audio_volume: 100,
            video_volume: 20,
          });
          console.log("Using authorized trending Instagram music.", { audioId: String(audioId) });
        } else {
          console.warn("Instagram returned no authorized trending music; publishing Reel with its existing audio.");
        }
      } catch (error) {
        console.warn("Instagram trending music lookup failed; publishing Reel without catalog music.", error.response?.data || error.message);
      }
    }

    // ----------------------------------------------
    // CREATE REEL CONTAINER
    // ----------------------------------------------

    const containerParams = {
      media_type: mediaType,
      video_url: videoUrl,
      caption: getInstagramCaption(content),
      share_to_feed: true,
      ...(audioConfiguration ? { audio_configuration: audioConfiguration } : {}),
      access_token: accessToken,
    };
    let containerResponse;
    try {
      containerResponse = await graphApi.post(
        `${graphBase}/${instagramAccountId}/media`,
        null,
        { params: containerParams }
      );
    } catch (error) {
      if (audioConfiguration) {
        console.warn("Meta rejected the attached music; retrying this Reel without catalog music.", error.response?.data || error.message);
        delete containerParams.audio_configuration;
        try {
          containerResponse = await graphApi.post(
            `${graphBase}/${instagramAccountId}/media`,
            null,
            { params: containerParams }
          );
        } catch (retryError) {
          throw formatMetaError(
            retryError,
            `Instagram ${mediaType === "REELS" ? "Reel" : "video"} container creation failed`
          );
        }
      } else {
        throw formatMetaError(
          error,
          `Instagram ${mediaType === "REELS" ? "Reel" : "video"} container creation failed`
        );
      }
    }

    const creationId =
      containerResponse?.data?.id;

    if (!creationId) {
      throw new Error(
        "Instagram did not return creation ID."
      );
    }

    console.log(
      "Instagram container created:",
      creationId
    );

    // ----------------------------------------------
    // WAIT FOR VIDEO PROCESSING
    // ----------------------------------------------

    let finalStatus = "";
    let lastStatusCheckError = "";

    for (
      let attempt = 1;
      attempt <= 18;
      attempt++
    ) {
      await sleep(5000);

      try {
        const statusResponse =
          await graphApi.get(
            `${graphBase}/${creationId}`,
            {
              params: {
                fields:
                  "id,status_code,status",

                access_token:
                  accessToken,
              },

              timeout: 8_000,
            }
          );

        finalStatus =
          statusResponse?.data
            ?.status_code ||
          statusResponse?.data
            ?.status ||
          "";
        lastStatusCheckError = "";

        console.log(
          `Instagram processing attempt ${attempt}:`,
          finalStatus
        );

        const normalizedStatus =
          String(finalStatus)
            .toUpperCase();

        if (
          normalizedStatus.includes(
            "ERROR"
          )
        ) {
          const providerMessage = statusResponse?.data?.error_message || statusResponse?.data?.status || "";
          throw new Error(
            `Instagram Reel processing failed: ${finalStatus}${providerMessage && providerMessage !== finalStatus ? ` — ${providerMessage}` : ""}`
          );
        }

        if (
          normalizedStatus.includes(
            "FINISHED"
          )
        ) {
          break;
        }
      } catch (error) {
        if (
          error.message?.includes(
            "Instagram Reel processing failed"
          )
        ) {
          throw error;
        }

        console.log(
          "Instagram status check warning:",
          error.message
        );
        lastStatusCheckError = error.message;
      }
    }

    if (
      !String(finalStatus)
        .toUpperCase()
        .includes("FINISHED")
    ) {
      throw new Error(
        `Instagram Reel processing did not finish in time. Last status: ${finalStatus || "unknown"}.${lastStatusCheckError ? ` Last check error: ${lastStatusCheckError}` : ""}`
      );
    }

    // ----------------------------------------------
    // PUBLISH
    // ----------------------------------------------

    let publishResponse;

    try {
      publishResponse =
        await graphApi.post(
          `${graphBase}/${instagramAccountId}/media_publish`,
          null,
          {
            params: {
              creation_id:
                creationId,

              access_token:
                accessToken,
            },
          }
        );
    } catch (error) {
      throw formatMetaError(
        error,
        `Instagram ${mediaType === "REELS" ? "Reel" : "video"} publish failed`
      );
    }

    const mediaId =
      publishResponse?.data?.id;

    if (!mediaId) {
      throw new Error(
        "Instagram did not return published media ID."
      );
    }

    console.log(
      "Instagram Reel published:",
      mediaId
    );

    // ----------------------------------------------
    // GET INSTAGRAM PERMALINK
    // ----------------------------------------------

    let publishedUrl = "";

    try {
      const permalinkResponse =
        await graphApi.get(
          `${graphBase}/${mediaId}`,
          {
            params: {
              fields:
                "id,permalink",

              access_token:
                accessToken,
            },
          }
        );

      publishedUrl =
        permalinkResponse?.data
          ?.permalink ||
        "";

      console.log(
        "Instagram permalink response:",
        JSON.stringify(
          permalinkResponse.data,
          null,
          2
        )
      );

    } catch (error) {
      console.log(
        "Instagram permalink lookup warning:",
        error?.response?.data ||
          error.message
      );
    }

    // ----------------------------------------------
    // RETURN INSTAGRAM RESULT
    // ----------------------------------------------

    return {
      success: true,

      postId:
        mediaId,

      publishedUrl,
    };
  };

const waitForInstagramContainer = async ({
  creationId,
  accessToken,
  mediaLabel,
  graphBase = INSTAGRAM_GRAPH_BASE,
}) => {
  let finalStatus = "";

  for (let attempt = 1; attempt <= 15; attempt++) {
    await sleep(2000);

    try {
      const response = await graphApi.get(
        `${graphBase}/${creationId}`,
        {
          params: {
            fields: "id,status_code,status",
            access_token: accessToken,
          },
          timeout: 8_000,
        }
      );

      finalStatus = response.data?.status_code || response.data?.status || "";
      const normalizedStatus = String(finalStatus).toUpperCase();

      console.log(
        `Instagram ${mediaLabel} processing attempt ${attempt}:`,
        finalStatus
      );

      if (normalizedStatus.includes("FINISHED")) {
        return;
      }

      if (normalizedStatus.includes("ERROR")) {
        throw new Error(`Instagram ${mediaLabel} processing failed: ${finalStatus}`);
      }
    } catch (error) {
      if (error.message?.includes("processing failed")) {
        throw error;
      }

      console.log(`Instagram ${mediaLabel} status check warning:`, error.message);
    }
  }

  throw new Error(
    `Instagram ${mediaLabel} processing did not finish in the expected time.`
  );
};

const isInstagramMediaNotReady = (error) =>
  error?.response?.data?.error?.code === 9007 ||
  error?.response?.data?.error?.error_subcode === 2207027;

const getInstagramCaption = (content) => {
  const caption = String(content?.caption || "").trim();
  if (/link in (?:our )?bio/i.test(caption)) return caption.slice(0, 2200);
  return [caption, "Shop through the link in our bio."]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2200);
};

const publishInstagramPhoto = async ({ content, account }) => {
  const instagramAccountId = account.instagramAccountId || account.accountId;
  const accessToken = account.accessToken;
  const graphBase = getInstagramGraphBase(account);
  if (!instagramAccountId || !accessToken || !content?.media?.url) {
    throw new Error("Instagram account, access token, or image is missing.");
  }
  await verifyInstagramAccount({ instagramAccountId, accessToken, graphBase });
  let containerResponse;
  try {
    containerResponse = await graphApi.post(
      `${graphBase}/${instagramAccountId}/media`,
      null,
      { params: { image_url: content.media.url, caption: getInstagramCaption(content), access_token: accessToken } }
    );
  } catch (error) {
    throw formatMetaError(error, "Instagram photo container creation failed");
  }
  const creationId = containerResponse.data?.id;
  if (!creationId) throw new Error("Instagram did not return a photo container ID.");
  await waitForInstagramContainer({
    creationId,
    accessToken,
    mediaLabel: "photo",
    graphBase,
  });

  let publishResponse = null;
  let lastPublishError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
    publishResponse = await graphApi.post(
        `${graphBase}/${instagramAccountId}/media_publish`,
        null,
        { params: { creation_id: creationId, access_token: accessToken } }
      );
      break;
    } catch (error) {
      lastPublishError = error;
      if (!isInstagramMediaNotReady(error) || attempt === 3) {
        throw formatMetaError(error, "Instagram photo publish failed");
      }

      console.log(`Instagram photo is not ready yet; retrying publish (${attempt}/3).`);
      await sleep(3000);
    }
  }
  if (!publishResponse && lastPublishError) throw formatMetaError(lastPublishError, "Instagram photo publish failed");
  const postId = publishResponse.data?.id;
  if (!postId) throw new Error("Instagram did not return a published media ID.");
  return {
    success: true,
    postId,
    publishedUrl: await lookupPublishedUrl(graphBase, postId, accessToken),
  };
};

// ======================================================
// TIKTOK
// ======================================================

const publishTikTok =
  async () => {
    throw new Error(
      "TikTok publishing API is not connected yet."
    );
  };

// ======================================================
// PUBLISH PLATFORM
// ======================================================

const publishToPlatform =
  async ({
    platform,
    content,
  }) => {
    if (
      platform === "facebook"
    ) {
      const {
        account,
      } =
        await getFacebookAccount();

      if (content?.media?.resourceType === "video" || content?.type === "reel") {
        if (content?.type !== "reel") return publishFacebookVideo({ content, account });
        return publishFacebookReel({ content, account });
      }
      if (content?.media?.url && content?.media?.resourceType !== "video") {
        return publishFacebookPhoto({ content, account });
      }
      return publishFacebookText({ content, account });
    }

    if (
      platform === "instagram"
    ) {
      const {
        account,
      } =
        await getInstagramAccount();

      if (content?.media?.resourceType === "video" || content?.type === "reel") {
        return publishInstagramReel({ content, account, mediaType: content?.type === "reel" ? "REELS" : "VIDEO" });
      }
      if (content?.media?.url && content?.media?.resourceType !== "video") {
        return publishInstagramPhoto({ content, account });
      }
      throw new Error("Instagram publishing requires an uploaded image or video Reel.");
    }

    if (
      platform === "tiktok"
    ) {
      return publishTikTok();
    }

    throw new Error(
      `Unsupported platform: ${platform}`
    );
  };

// ======================================================
// DELETE FACEBOOK OLD POST
// ======================================================

const deleteFacebookPost =
  async ({
    postId,
    account,
  }) => {
    if (!postId) {
      return {
        success: true,
        skipped: true,
        message:
          "No previous Facebook post.",
      };
    }

    try {
      await graphApi.delete(
        `${META_GRAPH_BASE}/${postId}`,
        {
          params: {
            access_token:
              account.accessToken,
          },
        }
      );

      return {
        success: true,
        skipped: false,
        message:
          "Previous Facebook post deleted.",
      };
    } catch (error) {
      const code =
        error?.response?.data
          ?.error?.code;

      if (code === 33) {
        return {
          success: true,
          skipped: false,
          message:
            "Previous Facebook post was already unavailable.",
        };
      }

      return {
        success: false,
        skipped: false,
        message:
          formatMetaError(
            error,
            "Facebook previous post deletion failed"
          ).message,
      };
    }
  };

// ======================================================
// DELETE INSTAGRAM OLD REEL
// ======================================================

const deleteInstagramPost =
  async ({
    postId,
    account,
  }) => {
    if (!postId) {
      return {
        success: true,
        skipped: true,
        message:
          "No previous Instagram Reel.",
      };
    }

    if (!account?.accessToken) {
      return {
        success: false,
        skipped: false,
        message:
          "Instagram access token is missing.",
      };
    }

    try {
      console.log(
        "Deleting previous Instagram Reel:",
        postId
      );

      await graphApi.delete(
        `${META_GRAPH_BASE}/${postId}`,
        {
          params: {
            access_token:
              account.accessToken,
          },
        }
      );

      console.log(
        "Previous Instagram Reel deleted:",
        postId
      );

      return {
        success: true,
        skipped: false,
        message:
          "Previous Instagram Reel deleted successfully.",
      };
    } catch (error) {
      const metaError =
        error?.response?.data
          ?.error;

      const code =
        metaError?.code;

      const message =
        metaError?.message ||
        error.message;

      if (code === 33) {
        return {
          success: true,
          skipped: false,
          message:
            "Previous Instagram Reel was already unavailable.",
        };
      }

      return {
        success: false,
        skipped: false,
        message:
          `Instagram previous Reel deletion failed: ${message}`,
      };
    }
  };

// ======================================================
// DELETE OLD PLATFORM POST
// ======================================================

const deletePreviousPublishedPost = async ({
  platform,
  postId,
}) => {
  if (!postId) {
    return {
      success: true,
      skipped: true,
      message: "No previous post found.",
    };
  }

  /* ==========================================
     FACEBOOK
  ========================================== */

  if (platform === "facebook") {
    try {
      const { account } =
        await getFacebookAccount();

      await graphApi.delete(
        `${META_GRAPH_BASE}/${postId}`,
        {
          params: {
            access_token:
              account.accessToken,
          },
        }
      );

      return {
        success: true,
        skipped: false,
        message:
          "Previous Facebook post deleted.",
      };
    } catch (error) {
      const metaError =
        error?.response?.data?.error;

      /*
        If Facebook says object does not
        exist anymore, consider it deleted.
      */

      if (metaError?.code === 33) {
        return {
          success: true,
          skipped: false,
          message:
            "Previous Facebook post was already deleted/unavailable.",
        };
      }

      return {
        success: false,
        skipped: false,
        message:
          formatMetaError(
            error,
            "Facebook previous post deletion failed"
          ).message,
      };
    }
  }

    /* ==========================================
     INSTAGRAM
  ========================================== */

  if (platform === "instagram") {
    if (!META_LOGIN_CONFIG_ID) {
      return {
        success: false,
        skipped: false,
        message:
          "Instagram post deletion is not configured. Add a Facebook Login for Business config with instagram_manage_contents permission, set META_LOGIN_CONFIG_ID, then reconnect Facebook.",
      };
    }

    try {
      const {
        account: facebookAccount,
        accessToken: pageAccessToken,
      } = await getFacebookAccount();

      if (!pageAccessToken) {
        return {
          success: false,
          skipped: false,
          message:
            "Facebook Page access token is missing. Reconnect Facebook to enable Instagram post deletion.",
        };
      }

      console.log(
        "======================================"
      );

      console.log(
        "INSTAGRAM DELETE DEBUG"
      );

      console.log(
        "Facebook Page:",
        facebookAccount.pageName
      );

      console.log(
        "Facebook Page Token Type:",
        facebookAccount.tokenType
      );

      console.log(
        "Previous Media ID:",
        postId
      );

      console.log(
        "Delete URL:",
        `${META_GRAPH_BASE}/${postId}`
      );

      console.log(
        "======================================"
      );

      await graphApi.delete(
        `${META_GRAPH_BASE}/${postId}`,
        {
          params: {
            access_token: pageAccessToken,
          },
        }
      );

      console.log(
        "Instagram previous media DELETE request succeeded."
      );

      return {
        success: true,
        skipped: false,
        message:
          "Previous Instagram media deleted successfully.",
      };

    } catch (error) {
      const metaError =
        error?.response?.data?.error;

      const permissionHint =
        metaError?.code === 10 || metaError?.code === 200
          ? " Meta denied deletion; confirm instagram_manage_contents is granted in the Facebook Login for Business config and reconnect Facebook."
          : "";

      console.error(
        "======================================"
      );

      console.error(
        "INSTAGRAM DELETE FAILED"
      );

      console.error(
        "HTTP Status:",
        error?.response?.status
      );

      console.error(
        "Meta Error:",
        JSON.stringify(
          error?.response?.data,
          null,
          2
        )
      );

      console.error(
        "Message:",
        metaError?.message ||
          error.message
      );

      console.error(
        "Code:",
        metaError?.code
      );

      console.error(
        "Subcode:",
        metaError?.error_subcode
      );

      console.error(
        "======================================"
      );

      return {
        success: false,
        skipped: false,
        message:
          `Instagram previous media deletion failed: ${
            metaError?.message ||
            error.message
          }${
            metaError?.code !== undefined
              ? ` Code: ${metaError.code}.`
              : ""
          }${
            metaError?.error_subcode !== undefined
              ? ` Subcode: ${metaError.error_subcode}.`
              : ""
          }${permissionHint}`,
      };
    }
  }
  /* ==========================================
     TIKTOK
  ========================================== */

  if (platform === "tiktok") {
    return {
      success: true,
      skipped: true,
      message:
        "TikTok previous-post deletion is not connected yet.",
    };
  }

  return {
    success: true,
    skipped: true,
    message:
      "Deletion skipped.",
  };
};
  

// ======================================================
// NEXT SCHEDULE DATE
// ======================================================

const calculateNextSchedule =
  ({
    currentDate,
    repeatEvery,
  }) => {
    const interval =
      Number(repeatEvery);

    if (
      !Number.isInteger(interval) ||
      interval < 1
    ) {
      throw new Error(
        "Repeat interval must be at least 1 day."
      );
    }

    const next =
      new Date(currentDate);

    next.setDate(
      next.getDate() +
        interval
    );

    return next;
  };

// ======================================================
// PROCESS ONE SCHEDULE
// ======================================================

const processSchedule =
  async (scheduleId) => {
    // ----------------------------------------------
    // LOCK
    // ----------------------------------------------

    const lockedSchedule =
      await Schedule.findOneAndUpdate(
        {
          _id: scheduleId,
          status: "scheduled",
          scheduledAt: {
            $lte: new Date(),
          },
        },
        {
          $set: {
            status: "processing",
            lastRunAt: new Date(),
            errorMessage: "",
          },

          $inc: {
            runCount: 1,
          },
        },
        {
          new: true,
        }
      );

    if (!lockedSchedule) {
      return {
        success: false,
        message:
          "Schedule is already processing or is not due.",
      };
    }

    try {
      if (!lockedSchedule.retryOnlyFailed) {
        lockedSchedule.retryRecoveryApplied = false;
        lockedSchedule.currentRunStartedAt = lockedSchedule.lastRunAt;
        await lockedSchedule.save();
      }

      // ----------------------------------------------
      // CONTENT
      // ----------------------------------------------

      let content =
        await Content.findById(
          lockedSchedule.content
        );

      if (!content) {
        throw new Error(
          "Scheduled content not found."
        );
      }

      // ----------------------------------------------
      // PRODUCT
      // ----------------------------------------------

      const product =
        await Product.findById(
          content.product
        );

      if (!product) {
        throw new Error(
          "Product for scheduled content not found."
        );
      }

      // ----------------------------------------------
      // PLATFORMS
      // ----------------------------------------------

      const platforms =
        getSchedulePlatforms(
          lockedSchedule
        );

      // Instagram Reel processing can take much longer than Facebook's
      // start/upload handshake. Attempt Instagram first so a slow Facebook
      // upload cannot consume the entire Vercel invocation before Instagram.
      platforms.sort((left, right) => {
        const priority = { instagram: 0, facebook: 1 };
        return (priority[left] ?? 2) - (priority[right] ?? 2);
      });

      if (platforms.length === 0) {
        throw new Error(
          "No publishing platform selected."
        );
      }

      if (platforms.includes("tiktok")) {
        throw new Error("TikTok publishing is not configured. Remove TikTok from this schedule before it runs.");
      }

      const savedProductVideo = getProductVideoAsset(product);
      if (savedProductVideo?.url) {
        // Always prefer the seller's own product video for a Reel, including
        // schedules created before automatic Reel preparation was added.
        console.log("Using the seller-uploaded product video for this Reel.", {
          productId: String(product._id),
          publicId: savedProductVideo.publicId || "",
        });
        content.type = "reel";
        content.media = {
          url: savedProductVideo.url,
          publicId: savedProductVideo.publicId || "",
          resourceType: "video",
        };
        content.generatedAutomatically = true;
        await content.save();
      } else if (
        lockedSchedule.generateNewContent &&
        lockedSchedule.repeatEnabled &&
        lockedSchedule.runCount > 1 &&
        !lockedSchedule.retryOnlyFailed &&
        content.generatedAutomatically
      ) {
        // Refresh image-based media weekly in the same Content record, so
        // each repost is fresh without creating another content card.
        const oldMedia = content.media;
        const generatedMedia = await generateProductImageReelAsset(product);
        content.type = "reel";
        content.media = generatedMedia;
        content.generatedAutomatically = true;
        await content.save();
        if (oldMedia?.publicId !== generatedMedia.publicId) {
          await deleteGeneratedReelAsset(oldMedia);
        }
      } else if (content.type !== "reel" || content.media?.resourceType !== "video") {
        // Convert older image-post schedules once, then use the stored Reel
        // until its next automatic weekly refresh.
        const generatedMedia = await generateProductImageReelAsset(product);
        content.type = "reel";
        content.media = generatedMedia;
        content.generatedAutomatically = true;
        await content.save();
      }

      console.log(
        "======================================"
      );

      console.log(
        "PROCESSING SCHEDULE:",
        lockedSchedule._id.toString()
      );

      console.log(
        "Run:",
        lockedSchedule.runCount
      );

      console.log(
        "Platforms:",
        platforms.join(", ")
      );

      console.log(
        "Repeat:",
        lockedSchedule.repeatEnabled
      );

      console.log(
        "Repeat Every:",
        lockedSchedule.repeatEvery
      );

      console.log(
        "Auto Delete:",
        lockedSchedule.autoDeletePrevious
      );

      console.log(
        "======================================"
      );

      // ----------------------------------------------
      // PUBLISH ALL PLATFORMS
      // ----------------------------------------------

      const previousCyclePosts = Array.isArray(lockedSchedule.publishedPosts)
        ? lockedSchedule.publishedPosts.map((post) => post.toObject?.() || post)
        : [];
      const runStartedAt = new Date(
        lockedSchedule.currentRunStartedAt || lockedSchedule.lastRunAt || Date.now()
      );
      const results = lockedSchedule.retryOnlyFailed
        ? previousCyclePosts.filter((post) => {
            const attemptedAt = post.attemptedAt || post.publishedAt;
            return attemptedAt && new Date(attemptedAt) >= runStartedAt;
          })
        : [];

      const savePlatformResult = async (result) => {
        const resultIndex = results.findIndex((item) => item.platform === result.platform);
        if (resultIndex >= 0) results[resultIndex] = result;
        else results.push(result);

        const savedPosts = Array.isArray(lockedSchedule.publishedPosts)
          ? lockedSchedule.publishedPosts.map((post) => post.toObject?.() || post)
          : [];
        const savedIndex = savedPosts.findIndex((item) => item.platform === result.platform);
        if (savedIndex >= 0) savedPosts[savedIndex] = result;
        else savedPosts.push(result);
        lockedSchedule.publishedPosts = savedPosts;
        await lockedSchedule.save();
      };

      const queuePendingPostDeletion = async (platform, postId, lastError) => {
        if (!postId) return;
        const pending = (lockedSchedule.pendingPostDeletions || []).map((item) => item.toObject?.() || item);
        const existingIndex = pending.findIndex((item) => item.platform === platform && item.postId === postId);
        if (existingIndex >= 0) pending[existingIndex] = { ...pending[existingIndex], lastError };
        else pending.push({ platform, postId, lastError, queuedAt: new Date() });
        lockedSchedule.pendingPostDeletions = pending;
        await lockedSchedule.save();
      };

      for (
        const platform of platforms
      ) {
        console.log(
          `Publishing to ${platform}...`
        );

        const currentResult = results.find((item) => item.platform === platform);
        const previous = currentResult || previousCyclePosts.find((item) => item.platform === platform) || null;

        const previousPostId =
          previous?.postId ||
          (platform === "facebook"
            ? lockedSchedule.previousPublishedPostId
            : "");
        let previousPostDeleted = false;
        let previousPostDeleteWarning = "";

        const pending = (lockedSchedule.pendingPostDeletions || []).map((item) => item.toObject?.() || item);
        const pendingForPlatform = pending.filter((item) => item.platform === platform);
        const retainedPending = pending.filter((item) => item.platform !== platform);
        const deletedPendingIds = new Set();
        for (const item of pendingForPlatform) {
          try {
            const cleanup = await deletePreviousPublishedPost({ platform, postId: item.postId });
            if (cleanup.success) {
              deletedPendingIds.add(item.postId);
              console.log(`Cleaned up previous ${platform} post ${item.postId}:`, cleanup.message);
            } else {
              retainedPending.push({ ...item, lastError: cleanup.message });
            }
          } catch (cleanupError) {
            retainedPending.push({ ...item, lastError: cleanupError.message });
          }
        }
        if (pendingForPlatform.length) {
          lockedSchedule.pendingPostDeletions = retainedPending;
          await lockedSchedule.save();
        }

        if (lockedSchedule.retryOnlyFailed && currentResult?.success) {
          console.log(`${platform} already succeeded in this run; skipping duplicate publish during retry.`);
          continue;
        }

        try {
          // Try to delete the previous post first. If Meta refuses deletion,
          // retain its ID for later cleanup but do not let cleanup block new reach.
          if (
            lockedSchedule.autoDeletePrevious &&
            previousPostId
          ) {
            if (deletedPendingIds.has(previousPostId)) {
              previousPostDeleted = true;
            } else {
              const alreadyQueued = retainedPending.find(
                (item) => item.platform === platform && item.postId === previousPostId
              );
              const deleteResult = alreadyQueued
                ? { success: false, message: alreadyQueued.lastError || "Previous post deletion is queued for retry." }
                : await deletePreviousPublishedPost({ platform, postId: previousPostId });

              console.log(`${platform} delete result:`, deleteResult.message);
              if (!deleteResult.success) {
                previousPostDeleteWarning = deleteResult.message;
                await queuePendingPostDeletion(platform, previousPostId, deleteResult.message);
              } else {
                previousPostDeleted = !deleteResult.skipped;
              }
            }
          }

          // ----------------------------------------
          // PUBLISH AFTER PREVIOUS POST CLEANUP
          // ----------------------------------------

          // A product's uploaded video is the preferred scheduled media.
          // Use the generated Reel only when the product has no saved video.
          await savePlatformResult({
            platform,
            postId: previousPostDeleted ? "" : previousPostId,
            publishedUrl: "",
            publishedAt: null,
            attemptedAt: new Date(),
            attempting: true,
            deletedPreviousPost: previousPostDeleted,
            deleteMessage: "",
            success: false,
            error: "Publishing started; waiting for the platform to confirm the result.",
          });

          const published =
            await publishToPlatform({
              platform,
              content,
            });

          console.log(
            `${platform} new post published:`,
            published.postId
          );

          // ----------------------------------------
          // SAVE RESULT
          // ----------------------------------------

          const result = {
            platform,

            postId:
              published.postId ||
              "",

            publishedUrl:
              published.publishedUrl ||
              "",

            publishedAt:
              new Date(),

            attemptedAt:
              new Date(),

            attempting:
              false,

            deletedPreviousPost:
              previousPostDeleted,

            deleteMessage:
              previousPostDeleted
                ? "Previous post deleted before publishing."
                : previousPostDeleteWarning
                  ? `New post published; previous post deletion is queued for retry: ${previousPostDeleteWarning}`
                  : "",

            success: true,

            error: "",
          };

          result.attempting = false;
          result.attemptedAt = new Date();

          await savePlatformResult(result);

          content.status = "published";
          content.publishedPosts = Array.isArray(content.publishedPosts) ? content.publishedPosts : [];
          const contentPostIndex = content.publishedPosts.findIndex((item) => item.platform === platform);
          const savedContentPost = {
            platform,
            postId: result.postId,
            publishedUrl: result.publishedUrl,
            publishedAt: result.publishedAt,
          };
          if (contentPostIndex >= 0) content.publishedPosts[contentPostIndex] = savedContentPost;
          else content.publishedPosts.push(savedContentPost);
          content.publishedPostId = result.postId;
          content.publishedUrl = result.publishedUrl;
          content.publishedAt = result.publishedAt;
          await content.save();
        } catch (platformError) {
          console.error(
            `${platform} publish failed:`,
            platformError.message
          );

          await savePlatformResult({
            platform,

            postId: previousPostDeleted ? "" : previousPostId,

            publishedUrl: "",

            publishedAt: null,

            attemptedAt: new Date(),

            attempting: false,

            deletedPreviousPost:
              false,

            deleteMessage: "",

            success: false,

            error:
              platformError.message,
          });
        }
      }

      // ----------------------------------------------
      // SAVE ALL RESULTS
      // ----------------------------------------------

      lockedSchedule.publishedPosts =
        results;

      const successfulResults =
        results.filter(
          (item) =>
            item.success
        );

      const failedResults =
        results.filter(
          (item) =>
            !item.success && !item.manualRequired
        );

      // ----------------------------------------------
      // UPDATE LEGACY FIELDS
      // ----------------------------------------------

      const firstSuccess =
        successfulResults[0];

      if (firstSuccess) {
        lockedSchedule.publishedPostId =
          firstSuccess.postId ||
          "";

        lockedSchedule.publishedUrl =
          firstSuccess.publishedUrl ||
          "";

        lockedSchedule.publishedAt =
          firstSuccess.publishedAt;

        lockedSchedule.previousPublishedPostId =
          firstSuccess.postId ||
          "";
      }

      // ----------------------------------------------
      // CONTENT STATUS
      // ----------------------------------------------

      if (
        successfulResults.length > 0
      ) {
        content.status =
          "published";

        for (const publishedPost of successfulResults) {
          const existingIndex = content.publishedPosts.findIndex(
            (item) => item.platform === publishedPost.platform
          );
          const savedPost = {
            platform: publishedPost.platform,
            postId: publishedPost.postId || "",
            publishedUrl: publishedPost.publishedUrl || "",
            publishedAt: publishedPost.publishedAt || new Date(),
          };
          if (existingIndex >= 0) {
            content.publishedPosts[existingIndex] = savedPost;
          } else {
            content.publishedPosts.push(savedPost);
          }
        }

        content.publishedPostId = firstSuccess.postId || "";
        content.publishedUrl = firstSuccess.publishedUrl || "";

        content.publishedAt =
          new Date();

        await content.save();
      }

      // ----------------------------------------------
      // REPEAT
      // ----------------------------------------------

      if (
        lockedSchedule.repeatEnabled &&
        failedResults.length > 0
      ) {
        const retryForScheduledAt =
          lockedSchedule.retryForScheduledAt ||
          lockedSchedule.scheduledAt;
        const retryDelaysMinutes = [15, 30, 60];
        const retriesAlreadyUsed = Math.max(0, Number(lockedSchedule.retryCount || 0));
        const retryDelayMinutes = retriesAlreadyUsed < retryDelaysMinutes.length
          ? retryDelaysMinutes[retriesAlreadyUsed]
          : 24 * 60;
        const retryAt = new Date(Date.now() + retryDelayMinutes * 60 * 1000);

        lockedSchedule.retryOnlyFailed = true;
        lockedSchedule.retryCount = Math.min(retriesAlreadyUsed + 1, retryDelaysMinutes.length + 1);
        lockedSchedule.retryForScheduledAt = retryForScheduledAt;
        lockedSchedule.scheduledAt = retryAt;
        lockedSchedule.status = "scheduled";
        lockedSchedule.errorMessage = failedResults
          .map((item) => `${item.platform}: ${item.error}`)
          .join(" | ") + ` Next retry in ${retryDelayMinutes} minutes.`;

        await lockedSchedule.save();

        console.log("Retrying failed platforms without reposting successful platforms.");
        console.log(`Retry delay: ${retryDelayMinutes} minute(s).`);
        console.log("Retry scheduled for:", retryAt);

        return {
          success: successfulResults.length > 0,
          retrying: true,
          nextScheduledAt: retryAt,
          results,
        };
      }

      if (
        lockedSchedule.repeatEnabled &&
        successfulResults.length > 0
      ) {
        const recurringFrom =
          lockedSchedule.retryForScheduledAt ||
          lockedSchedule.scheduledAt;
        const nextDate =
          calculateNextSchedule({
            currentDate: recurringFrom,

            repeatEvery:
              lockedSchedule.repeatEvery,
          });

        lockedSchedule.scheduledAt =
          nextDate;

        lockedSchedule.status =
          "scheduled";

        lockedSchedule.retryOnlyFailed = false;
        lockedSchedule.retryCount = 0;
        lockedSchedule.retryForScheduledAt = null;
        lockedSchedule.retryRecoveryApplied = failedResults.length > 0;

        lockedSchedule.errorMessage =
          failedResults.length > 0
            ? failedResults
                .map(
                  (item) =>
                    `${item.platform}: ${item.error}`
                )
                .join(" | ")
            : "";

        await lockedSchedule.save();

        console.log(
          "======================================"
        );

        console.log(
          "Schedule repeated successfully."
        );

        console.log(
          "Next scheduled time:",
          nextDate
        );

        console.log(
          "======================================"
        );

        return {
          success: true,

          repeated: true,

          nextScheduledAt:
            nextDate,

          results,
        };
      }

      // ----------------------------------------------
      // FINAL STATUS
      // ----------------------------------------------

      if (
        successfulResults.length === 0
      ) {
        lockedSchedule.status =
          "failed";

        lockedSchedule.errorMessage =
          failedResults
            .map(
              (item) =>
                `${item.platform}: ${item.error}`
            )
            .join(" | ");

        await lockedSchedule.save();

        return {
          success: false,
          results,
        };
      }

      lockedSchedule.status =
        "published";

      lockedSchedule.errorMessage =
        failedResults.length > 0
          ? failedResults
              .map(
                (item) =>
                  `${item.platform}: ${item.error}`
              )
              .join(" | ")
          : "";

      await lockedSchedule.save();

      return {
        success: true,
        results,
      };

    } catch (error) {
      console.error(
        "Schedule processing error:",
        error
      );

      await Schedule.findByIdAndUpdate(
        scheduleId,
        {
          $set: {
            status:
              "failed",

            errorMessage:
              error.message ||
              "Schedule processing failed.",
          },
        }
      );

      return {
        success: false,

        message:
          error.message,
      };
    }
  };

// ======================================================
// PROCESS DUE SCHEDULES
// ======================================================

const processDueSchedules =
  async () => {
    try {
      try {
        const autoScheduleResult = await ensureAutomaticSchedules();
        if (autoScheduleResult?.created || autoScheduleResult?.updated) {
          console.log("Automatic product schedules refreshed:", autoScheduleResult);
        }
      } catch (autoScheduleError) {
        console.error("Automatic schedule setup failed; processing existing due schedules:", autoScheduleError.message);
      }

      // If a recurring schedule was interrupted before we could confirm any
      // platform result, do not replay that uncertain post. Move it to its
      // next regular occurrence so the repeat schedule can continue cleanly.
      const interruptedRepeatingSchedules = await Schedule.find({
        status: "failed",
        repeatEnabled: true,
        errorMessage: /^Publishing was interrupted before any platform result was saved\./,
        scheduledAt: { $lte: new Date() },
      });

      const now = Date.now();
      for (const schedule of interruptedRepeatingSchedules) {
        const repeatDays = Math.max(1, Number(schedule.repeatEvery || 7));
        const intervalMs = repeatDays * 24 * 60 * 60 * 1000;
        const previousTime = new Date(schedule.scheduledAt).getTime();
        if (!Number.isFinite(previousTime) || !Number.isFinite(intervalMs)) continue;

        const missedIntervals = Math.floor((now - previousTime) / intervalMs) + 1;
        schedule.scheduledAt = new Date(previousTime + missedIntervals * intervalMs);
        schedule.status = "scheduled";
        schedule.errorMessage = "";
        schedule.retryOnlyFailed = false;
        schedule.retryCount = 0;
        schedule.retryRecoveryApplied = false;
        await schedule.save();
        console.log(
          `Advanced interrupted repeating schedule ${schedule._id} to ${schedule.scheduledAt.toISOString()} without replaying an unconfirmed post.`
        );
      }

      const recoveryCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recoverableSchedules = await Schedule.find({
        status: "scheduled",
        repeatEnabled: true,
        retryOnlyFailed: { $ne: true },
        retryRecoveryApplied: { $ne: true },
        lastRunAt: { $gte: recoveryCutoff },
        scheduledAt: { $gt: new Date() },
        errorMessage: { $ne: "" },
      });

      for (const schedule of recoverableSchedules) {
        const runStartedAt = new Date(
          schedule.currentRunStartedAt || schedule.lastRunAt || schedule.createdAt || 0
        );
        const results = (schedule.publishedPosts || []).filter((post) => {
          const attemptedAt = post.attemptedAt || post.publishedAt;
          return attemptedAt && new Date(attemptedAt) >= runStartedAt;
        });
        const hasSuccess = results.some((item) => item.success);
        const successfulPlatforms = new Set(results.filter((item) => item.success).map((item) => item.platform));
        const hasUnconfirmedPlatform = getSchedulePlatforms(schedule).some((platform) => !successfulPlatforms.has(platform));
        if (!hasSuccess || !hasUnconfirmedPlatform) continue;

        const repeatDays = Math.max(1, Number(schedule.repeatEvery || 1));
        schedule.retryForScheduledAt = new Date(
          schedule.scheduledAt.getTime() - repeatDays * 24 * 60 * 60 * 1000
        );
        schedule.retryOnlyFailed = true;
        schedule.retryCount = 0;
        schedule.retryRecoveryApplied = true;
        schedule.scheduledAt = new Date(Date.now() + 30 * 1000);
        await schedule.save();
        console.log(
          `Recovered failed platform(s) for schedule ${schedule._id}; retrying without reposting successful platforms.`
        );
      }

      // The Vercel function is capped at 5 minutes. Add a 2-minute safety
      // margin, then recover interrupted work on the next cron invocation.
      const staleProcessingBefore = new Date(Date.now() - 7 * 60 * 1000);
      const staleProcessingSchedules = await Schedule.find({
        status: "processing",
        $or: [
          { lastRunAt: { $lte: staleProcessingBefore } },
          { lastRunAt: null },
        ],
      });

      for (const schedule of staleProcessingSchedules) {
        const runStartedAt = new Date(
          schedule.currentRunStartedAt || schedule.lastRunAt || schedule.createdAt || 0
        );
        const currentRunResults = (schedule.publishedPosts || []).filter((post) => {
          const attemptedAt = post.attemptedAt || post.publishedAt;
          return attemptedAt && new Date(attemptedAt) >= runStartedAt;
        });
        const uncertainResult = currentRunResults.find((post) => post.attempting);

        if (uncertainResult) {
          // Keep confirmed platform results intact and retry only the platform
          // whose response was interrupted. A 24-hour delay gives the social
          // platform time to expose a post whose publish response was lost.
          schedule.retryOnlyFailed = true;
          schedule.retryForScheduledAt = schedule.retryForScheduledAt || schedule.scheduledAt;
          schedule.retryCount = Math.max(4, Number(schedule.retryCount || 0));
          schedule.retryRecoveryApplied = true;
          schedule.scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          schedule.status = "scheduled";
          schedule.errorMessage = `${uncertainResult.platform} publishing result was not confirmed before the worker timed out. Only that platform will retry in 24 hours; confirm it did not publish before then to avoid a possible duplicate.`;
          await schedule.save();
          continue;
        }

        if (currentRunResults.length === 0) {
          schedule.status = "failed";
          schedule.errorMessage = "Publishing was interrupted before any platform result was saved. Check Facebook and Instagram before retrying to avoid duplicate posts.";
          await schedule.save();
          continue;
        }

        schedule.retryOnlyFailed = true;
        schedule.retryCount = 0;
        schedule.retryForScheduledAt = schedule.retryForScheduledAt || schedule.scheduledAt;
        schedule.retryRecoveryApplied = true;
        schedule.scheduledAt = new Date();
        schedule.status = "scheduled";
        schedule.errorMessage = "Recovered after interrupted publishing; only platforms without a confirmed result will retry.";
        await schedule.save();
      }

      const dueSchedules =
        await Schedule.find({
          status:
            "scheduled",

          scheduledAt: {
            $lte: new Date(),
          },
        })
          .sort({
            scheduledAt: 1,
          })
          // One Reel may need one-time FFmpeg preparation if this is an older
          // image-only schedule. Keep work serial and within the function cap.
          .limit(1)
          .select("_id");

      if (dueSchedules.length === 0) {
        return { due: 0, processed: 0, schedules: [] };
      }

      console.log(
        `Found ${dueSchedules.length} due schedule(s).`
      );

      const schedules = [];
      for (const schedule of dueSchedules) {
        const result = await processSchedule(schedule._id);
        schedules.push({
          id: schedule._id.toString(),
          success: Boolean(result?.success),
          retrying: Boolean(result?.retrying),
          message: result?.message || "",
          results: (result?.results || []).map((item) => ({
            platform: item.platform,
            success: Boolean(item.success),
            error: item.error || "",
            postId: item.success ? item.postId || "" : "",
            publishedUrl: item.success ? item.publishedUrl || "" : "",
          })),
        });
      }

      return { due: dueSchedules.length, processed: schedules.length, schedules };

    } catch (error) {
      console.error("Due schedule worker error:", error);
      throw error;
    }
  };

// ======================================================
// META ERROR FORMAT
// ======================================================

const formatMetaError =
  (error, prefix) => {
    const metaError =
      error?.response?.data
        ?.error;

    if (metaError) {
      const message =
        metaError.message ||
        "Unknown Meta API error.";

      const code =
        metaError.code !== undefined
          ? ` Code: ${metaError.code}.`
          : "";

      const subcode =
        metaError.error_subcode !==
        undefined
          ? ` Subcode: ${metaError.error_subcode}.`
          : "";

      return new Error(
        `${prefix}: ${message}${code}${subcode}`
      );
    }

    return new Error(
      `${prefix}: ${error.message}`
    );
  };

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  processDueSchedules,
  processSchedule,
  publishToPlatform,
  deletePreviousPublishedPost,
  calculateNextSchedule,
};
