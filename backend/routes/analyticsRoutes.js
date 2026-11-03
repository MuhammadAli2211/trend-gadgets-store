const express = require("express");
const axios = require("axios");
const graphApi = axios.create({ proxy: false, timeout: 30_000 });

const Analytics = require("../models/Analytics");
const SocialAccount = require("../models/SocialAccount");
const Content = require("../models/Content");
const Schedule = require("../models/Schedule");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect, adminOnly);

const META_GRAPH_VERSION =
  process.env.META_GRAPH_VERSION || "v24.0";

const META_GRAPH_BASE =
  `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const INSTAGRAM_GRAPH_BASE =
  "https://graph.instagram.com";

const SOCIAL_SYNC_ID =
  "__meta_social_sync__";

// =====================================================
// EMPTY ANALYTICS
// =====================================================

const emptyAnalytics = () => ({
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  clicks: 0,
  whatsappClicks: 0,
  buyNowClicks: 0,
});

// =====================================================
// ERROR HELPER
// =====================================================

const getErrorData = (error) => {
  return (
    error?.response?.data ||
    error?.message ||
    "Unknown error"
  );
};

// =====================================================
// DATE FILTER
// =====================================================

const getDateMatch = (period) => {
  if (!period || period === "all") {
    return {};
  }

  const now = new Date();

  let startDate = null;

  if (period === "today") {
    startDate = new Date();

    startDate.setHours(
      0,
      0,
      0,
      0
    );
  }

  if (period === "7d") {
    startDate = new Date(
      now.getTime() -
        7 *
          24 *
          60 *
          60 *
          1000
    );
  }

  if (period === "30d") {
    startDate = new Date(
      now.getTime() -
        30 *
          24 *
          60 *
          60 *
          1000
    );
  }

  if (!startDate) {
    return {};
  }

  return {
    $or: [
      { publishedAt: { $gte: startDate, $lte: now } },
      {
        $and: [
          { $or: [{ publishedAt: null }, { publishedAt: { $exists: false } }] },
          { updatedAt: { $gte: startDate, $lte: now } },
        ],
      },
    ],
  };
};

// =====================================================
// BUILD MATCH
// =====================================================

const buildMatch = ({
  period,
  platform,
  productId,
  contentId,
  excludeSocialSync = false,
}) => {
  const match = {
    ...getDateMatch(period),
  };

  if (platform) {
    match.platform = platform;
  }

  if (productId !== undefined) {
    match.productId = String(
      productId
    );
  }

  if (contentId !== undefined) {
    match.contentId = String(
      contentId
    );
  }

  if (excludeSocialSync) {
    match.contentId = {
      ...(typeof match.contentId ===
      "object"
        ? match.contentId
        : {}),
      $ne: SOCIAL_SYNC_ID,
    };
  }

  return match;
};

// =====================================================
// FIND CONTENT FOR PUBLISHED POST
// =====================================================

const findContentForPublishedPost =
  async (
    platform,
    postId
  ) => {
    if (!postId) {
      return null;
    }

    try {
      const content =
        await Content.findOne({
          $or: [
            { publishedPostId: String(postId) },
            { publishedPosts: { $elemMatch: { platform, postId: String(postId) } } },
          ],
        }).populate(
          "product",
          "name price category images"
        );

      if (content) return content;

      const schedule = await Schedule.findOne({
        publishedPosts: { $elemMatch: { platform, postId: String(postId), success: true } },
      }).populate({
        path: "content",
        populate: { path: "product", select: "name price category images" },
      });
      return schedule?.content || null;
    } catch (error) {
      console.log(
        "Content lookup warning:",
        error.message
      );

      return null;
    }
  };

// =====================================================
// SAVE CONTENT ANALYTICS
// =====================================================

const saveContentAnalytics =
  async ({
    platform,
    content,
    views = 0,
    likes = 0,
    comments = 0,
    shares = 0,
    publishedAt = null,
  }) => {
    if (!content?._id) {
      return;
    }

    const contentId =
      String(content._id);

    const productId =
      content.product?._id
        ? String(
            content.product._id
          )
        : content.product
          ? String(
              content.product
            )
          : "";

    let analytics =
      await Analytics.findOne({
        platform,
        contentId,
      });

    if (!analytics) {
      analytics =
        await Analytics.create({
          platform,
          productId,
          contentId,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          clicks: 0,
          whatsappClicks: 0,
          buyNowClicks: 0,
        });
    }

    analytics.views =
      Number(views || 0);

    analytics.likes =
      Number(likes || 0);

    analytics.comments =
      Number(comments || 0);

    analytics.shares =
      Number(shares || 0);

    analytics.publishedAt = publishedAt || content.publishedAt || null;

    if (!analytics.productId) {
      analytics.productId =
        productId;
    }

    await analytics.save();
  };

const fetchAllGraphPages = async (url, params, maxPages = 10) => {
  const items = [];
  let after;
  const seenCursors = new Set();

  for (let page = 0; page < maxPages; page += 1) {
    const response = await graphApi.get(url, {
      params: { ...params, limit: 100, ...(after ? { after } : {}) },
    });
    const data = response.data?.data || [];
    items.push(...data);

    const next = response.data?.paging?.cursors?.after;
    if (!next || response.data?.paging?.next === undefined || seenCursors.has(next)) break;
    seenCursors.add(next);
    after = next;
  }

  return items;
};

const insightValue = (metric) => {
  if (metric?.total_value?.value !== undefined) {
    return Number(metric.total_value.value) || 0;
  }
  return (metric?.values || []).reduce(
    (total, item) => total + (Number(item.value) || 0),
    0
  );
};

// =====================================================
// INSTAGRAM SYNC
// =====================================================

const syncInstagramAnalytics =
  async (account) => {
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

    let totalLikes = 0;
    let totalComments = 0;
    let totalViews = 0;
    let totalShares = 0;

    const media = await fetchAllGraphPages(
      `${INSTAGRAM_GRAPH_BASE}/${instagramAccountId}/media`,
      {
        fields: "id,media_type,media_product_type,like_count,comments_count,timestamp,caption,permalink",
        access_token: account.accessToken,
      }
    );

    for (const item of media) {
      const likes =
        Number(
          item.like_count || 0
        );

      const comments =
        Number(
          item.comments_count || 0
        );

      let views = 0;
      let shares = 0;

      {
        try {
          const isVideo = item.media_type === "VIDEO" || item.media_product_type === "REELS";
          const metricsToTry = isVideo ? ["views", "plays"] : ["views", "impressions"];
          for (const metricName of metricsToTry) {
            try {
              const response = await graphApi.get(
                `${INSTAGRAM_GRAPH_BASE}/${item.id}/insights`,
                { params: { metric: metricName, access_token: account.accessToken } }
              );
              views = insightValue(response.data?.data?.find((metric) => metric.name === metricName));
              if (views || metricName === metricsToTry.at(-1)) break;
            } catch (error) {
              if (metricName === metricsToTry.at(-1)) throw error;
            }
          }
          if (isVideo) {
            try {
              const response = await graphApi.get(
                `${INSTAGRAM_GRAPH_BASE}/${item.id}/insights`,
                { params: { metric: "shares", access_token: account.accessToken } }
              );
              shares = insightValue(response.data?.data?.find((metric) => metric.name === "shares"));
            } catch {}
          }
        } catch (error) {
          console.log(
            "Instagram content insight warning:",
            error.response?.data ||
              error.message
          );
        }
      }

      totalLikes += likes;
      totalComments += comments;
      totalViews += views;
      totalShares += shares;

      let content =
        await findContentForPublishedPost(
          "instagram",
          item.id
        );

      if (
        !content &&
        item.permalink
      ) {
        try {
          content =
            await Content.findOne({
              publishedUrl:
                item.permalink,
            }).populate(
              "product",
              "name price category images"
            );
        } catch {}
      }

      if (content) {
        await saveContentAnalytics({
          platform:
            "instagram",
          content,
          views,
          likes,
          comments,
          shares,
          publishedAt: item.timestamp,
        });
      }
    }

    await Analytics.findOneAndUpdate(
      {
        platform:
          "instagram",
        productId: "",
        contentId:
          SOCIAL_SYNC_ID,
      },
      {
        platform:
          "instagram",
        productId: "",
        contentId:
          SOCIAL_SYNC_ID,
        views:
          totalViews,
        likes:
          totalLikes,
        comments:
          totalComments,
        shares:
          totalShares,
      },
      {
        upsert: true,
        new: true,
      }
    );

    return {
      views: totalViews,
      likes: totalLikes,
      comments:
        totalComments,
      shares:
        totalShares,
    };
  };

// =====================================================
// FACEBOOK SYNC
// =====================================================

const syncFacebookAnalytics =
  async (account) => {
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

    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalViews = 0;

    const posts = await fetchAllGraphPages(
      `${META_GRAPH_BASE}/${pageId}/feed`,
      {
        fields: "id,message,created_time,shares,reactions.limit(0).summary(true),comments.limit(0).summary(true)",
        access_token: account.accessToken,
      }
    );

    for (const post of posts) {
      const likes =
        Number(
          post.reactions?.summary
            ?.total_count || 0
        );

      const comments =
        Number(
          post.comments?.summary
            ?.total_count || 0
        );

      const shares =
        Number(
          post.shares?.count || 0
        );

      totalLikes += likes;
      totalComments +=
        comments;
      totalShares += shares;

      let views = 0;

      try {
        const insightMetric = "post_media_view";
        const insightsResponse = await graphApi.get(
          `${META_GRAPH_BASE}/${post.id}/insights`,
          { params: { metric: insightMetric, access_token: account.accessToken } }
        );

        const insights =
          insightsResponse.data?.data ||
          [];

        for (
          const metric of insights
        ) {
          const value =
              insightValue(metric);

          if (metric.name === insightMetric) views = value;
        }
      } catch (error) {
        console.warn(
          "Facebook post insight unavailable:",
          post.id,
          error.response?.data?.error?.message || error.message
        );
      }

      totalViews += views;

      const content =
        await findContentForPublishedPost(
          "facebook",
          post.id
        );

      if (content) {
        await saveContentAnalytics({
          platform:
            "facebook",
          content,
          views,
          likes,
          comments,
          shares,
          publishedAt: post.created_time,
        });
      }
    }

    await Analytics.findOneAndUpdate(
      {
        platform:
          "facebook",
        productId: "",
        contentId:
          SOCIAL_SYNC_ID,
      },
      {
        platform:
          "facebook",
        productId: "",
        contentId:
          SOCIAL_SYNC_ID,
        views:
          totalViews,
        likes:
          totalLikes,
        comments:
          totalComments,
        shares:
          totalShares,
      },
      {
        upsert: true,
        new: true,
      }
    );

    return {
      views: totalViews,
      likes: totalLikes,
      comments:
        totalComments,
      shares:
        totalShares,
    };
  };

// =====================================================
// META SYNC
// =====================================================

const syncMetaAnalytics =
  async () => {
    const result = {
      facebook: null,
      instagram: null,
      errors: [],
    };

    try {
      const facebookAccount =
        await SocialAccount.findOne({
          platform:
            "facebook",
          status:
            "connected",
          accessToken: {
            $exists: true,
            $ne: "",
          },
        }).sort({
          updatedAt: -1,
        });

      if (facebookAccount) {
        result.facebook =
          await syncFacebookAnalytics(
            facebookAccount
          );
      }
    } catch (error) {
      console.error(
        "Facebook analytics sync error:",
        getErrorData(error)
      );

      result.errors.push({
        platform:
          "facebook",
        message:
          error.response?.data
            ?.error?.message ||
          error.message,
      });
    }

    try {
      const instagramAccount =
        await SocialAccount.findOne({
          platform:
            "instagram",
          status:
            "connected",
          accessToken: {
            $exists: true,
            $ne: "",
          },
        }).sort({
          updatedAt: -1,
        });

      if (instagramAccount) {
        result.instagram =
          await syncInstagramAnalytics(
            instagramAccount
          );
      }
    } catch (error) {
      console.error(
        "Instagram analytics sync error:",
        getErrorData(error)
      );

      result.errors.push({
        platform:
          "instagram",
        message:
          error.response?.data
            ?.error?.message ||
          error.message,
      });
    }

    return result;
  };

// =====================================================
// AGGREGATE HELPER
// =====================================================

const aggregateAnalytics =
  async (match) => {
    const result =
      await Analytics.aggregate([
        {
          $match: match,
        },

        {
          $group: {
            _id: null,

            views: {
              $sum: "$views",
            },

            likes: {
              $sum: "$likes",
            },

            comments: {
              $sum: "$comments",
            },

            shares: {
              $sum: "$shares",
            },

            clicks: {
              $sum: "$clicks",
            },

            whatsappClicks: {
              $sum:
                "$whatsappClicks",
            },

            buyNowClicks: {
              $sum:
                "$buyNowClicks",
            },
          },
        },
      ]);

    const analytics =
      result[0] ||
      emptyAnalytics();

    delete analytics._id;

    return analytics;
  };

// =====================================================
// OVERALL ANALYTICS
// =====================================================

router.get(
  "/",
  async (req, res) => {
    try {
      const period =
        req.query.period ||
        "all";

      await syncMetaAnalytics();

      const match =
        buildMatch({
          period,
          excludeSocialSync:
            true,
        });

      const analytics =
        await aggregateAnalytics(
          match
        );

      res.json({
        success: true,
        period,
        analytics,
      });
    } catch (error) {
      console.error(
        "Overall analytics error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to load analytics.",
      });
    }
  }
);

// =====================================================
// PLATFORM ANALYTICS
// =====================================================

router.get(
  "/platform/:platform",
  async (req, res) => {
    try {
      const platform =
        req.params.platform;

      const period =
        req.query.period ||
        "all";

      const match =
        buildMatch({
          period,
          platform,
          excludeSocialSync:
            true,
        });

      const analytics =
        await aggregateAnalytics(
          match
        );

      res.json({
        success: true,
        platform,
        period,
        analytics,
      });
    } catch (error) {
      console.error(
        "Platform analytics error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to load platform analytics.",
      });
    }
  }
);

// =====================================================
// PRODUCT ANALYTICS
// =====================================================

router.get(
  "/product/:productId",
  async (req, res) => {
    try {
      const productId =
        String(
          req.params.productId
        );

      const period =
        req.query.period ||
        "all";

      const match =
        buildMatch({
          period,
          productId,
        });

      const analytics =
        await aggregateAnalytics(
          match
        );

      res.json({
        success: true,
        productId,
        period,
        analytics,
      });
    } catch (error) {
      console.error(
        "Product analytics error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message,
      });
    }
  }
);

// =====================================================
// CONTENT / REEL ANALYTICS
// =====================================================

router.get(
  "/content/:contentId",
  async (req, res) => {
    try {
      const contentId =
        String(
          req.params.contentId
        );

      const period =
        req.query.period ||
        "all";

      const match =
        buildMatch({
          period,
          contentId,
        });

      const analytics =
        await aggregateAnalytics(
          match
        );

      res.json({
        success: true,
        contentId,
        period,
        analytics,
      });
    } catch (error) {
      console.error(
        "Content analytics error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message,
      });
    }
  }
);

// =====================================================
// TOP PRODUCTS
// =====================================================

router.get(
  "/top-products",
  async (req, res) => {
    try {
      const limit = Math.min(
        Math.max(
          Number(
            req.query.limit || 10
          ),
          1
        ),
        50
      );

      const period =
        req.query.period ||
        "all";

      const match =
        buildMatch({
          period,
          excludeSocialSync:
            true,
        });

      match.productId = {
        $ne: "",
      };

      const result =
        await Analytics.aggregate([
          {
            $match: match,
          },

          {
            $group: {
              _id: "$productId",

              views: {
                $sum: "$views",
              },

              clicks: {
                $sum: "$clicks",
              },

              whatsappClicks: {
                $sum:
                  "$whatsappClicks",
              },

              buyNowClicks: {
                $sum:
                  "$buyNowClicks",
              },

              likes: {
                $sum: "$likes",
              },

              comments: {
                $sum: "$comments",
              },

              shares: {
                $sum: "$shares",
              },
            },
          },

          {
            $sort: {
              buyNowClicks: -1,
              whatsappClicks: -1,
              clicks: -1,
              views: -1,
            },
          },

          {
            $limit: limit,
          },

          {
            $lookup: {
              from: "products",

              let: {
                productId:
                  "$_id",
              },

              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: [
                        {
                          $toString:
                            "$_id",
                        },
                        "$$productId",
                      ],
                    },
                  },
                },

                {
                  $project: {
                    name: 1,
                    price: 1,
                    category: 1,
                    images: 1,
                  },
                },
              ],

              as: "product",
            },
          },

          {
            $unwind: {
              path:
                "$product",
              preserveNullAndEmptyArrays:
                true,
            },
          },
        ]);

      const products =
        result.map(
          (item) => ({
            productId:
              item._id,

            name:
              item.product?.name ||
              "Unknown Product",

            price:
              Number(
                item.product?.price ||
                  0
              ),

            category:
              item.product?.category ||
              "",

            image:
              item.product
                ?.images?.[0] ||
              "",

            views:
              Number(
                item.views || 0
              ),

            clicks:
              Number(
                item.clicks || 0
              ),

            whatsappClicks:
              Number(
                item.whatsappClicks ||
                  0
              ),

            buyNowClicks:
              Number(
                item.buyNowClicks ||
                  0
              ),

            likes:
              Number(
                item.likes || 0
              ),

            comments:
              Number(
                item.comments || 0
              ),

            shares:
              Number(
                item.shares || 0
              ),
          })
        );

      res.json({
        success: true,
        period,
        products,
      });
    } catch (error) {
      console.error(
        "Top products analytics error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get top products.",
      });
    }
  }
);

// =====================================================
// TOP CONTENT / REELS
// =====================================================

router.get(
  "/top-content",
  async (req, res) => {
    try {
      const limit = Math.min(
        Math.max(
          Number(
            req.query.limit || 20
          ),
          1
        ),
        50
      );

      const period =
        req.query.period ||
        "all";

      const match =
        buildMatch({
          period,
        });

      match.contentId = {
        $ne: "",
      };

      match.contentId = {
        $ne: SOCIAL_SYNC_ID,
      };

      const result =
        await Analytics.aggregate([
          {
            $match: match,
          },

          {
            $group: {
              _id: "$contentId",

              views: {
                $sum: "$views",
              },

              likes: {
                $sum: "$likes",
              },

              comments: {
                $sum: "$comments",
              },

              shares: {
                $sum: "$shares",
              },

              clicks: {
                $sum: "$clicks",
              },

              whatsappClicks: {
                $sum:
                  "$whatsappClicks",
              },

              buyNowClicks: {
                $sum:
                  "$buyNowClicks",
              },

              platforms: {
                $addToSet:
                  "$platform",
              },
            },
          },

          {
            $sort: {
              buyNowClicks: -1,
              whatsappClicks: -1,
              clicks: -1,
              views: -1,
            },
          },

          {
            $limit: limit,
          },

          {
            $lookup: {
              from: "contents",

              let: {
                contentId:
                  "$_id",
              },

              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: [
                        {
                          $toString:
                            "$_id",
                        },
                        "$$contentId",
                      ],
                    },
                  },
                },

                {
                  $project: {
                    caption: 1,
                    title: 1,
                    platform: 1,
                    status: 1,
                    media: 1,
                    publishedPostId: 1,
                    publishedUrl: 1,
                    product: 1,
                    createdAt: 1,
                  },
                },
              ],

              as: "content",
            },
          },

          {
            $unwind: {
              path:
                "$content",
              preserveNullAndEmptyArrays:
                true,
            },
          },

          {
            $lookup: {
              from: "products",

              let: {
                productId:
                  "$content.product",
              },

              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: [
                        "$_id",
                        "$$productId",
                      ],
                    },
                  },
                },

                {
                  $project: {
                    name: 1,
                    price: 1,
                    category: 1,
                    images: 1,
                  },
                },
              ],

              as: "product",
            },
          },

          {
            $unwind: {
              path:
                "$product",
              preserveNullAndEmptyArrays:
                true,
            },
          },
        ]);

      const contents =
        result.map(
          (item) => ({
            contentId:
              item._id,

            title:
              item.content?.title ||
              "Reel / Content",

            caption:
              item.content?.caption ||
              "",

            type:
              item.content?.media
                ?.resourceType ===
              "video"
                ? "Reel"
                : "Content",

            mediaUrl:
              item.content?.media
                ?.url ||
              "",

            publishedPostId:
              item.content
                ?.publishedPostId ||
              "",

            publishedUrl:
              item.content
                ?.publishedUrl ||
              "",

            status:
              item.content
                ?.status ||
              "",

            productId:
              item.content?.product
                ? String(
                    item.content.product
                  )
                : "",

            productName:
              item.product?.name ||
              "Unknown Product",

            productPrice:
              Number(
                item.product?.price ||
                  0
              ),

            productImage:
              item.product
                ?.images?.[0] ||
              "",

            platforms:
              item.platforms ||
              [],

            views:
              Number(
                item.views || 0
              ),

            likes:
              Number(
                item.likes || 0
              ),

            comments:
              Number(
                item.comments || 0
              ),

            shares:
              Number(
                item.shares || 0
              ),

            clicks:
              Number(
                item.clicks || 0
              ),

            whatsappClicks:
              Number(
                item.whatsappClicks ||
                  0
              ),

            buyNowClicks:
              Number(
                item.buyNowClicks ||
                  0
              ),
          })
        );

      res.json({
        success: true,
        period,
        contents,
      });
    } catch (error) {
      console.error(
        "Top content analytics error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get content analytics.",
      });
    }
  }
);

// =====================================================
// MANUAL META SYNC
// =====================================================

router.post(
  "/sync-meta",
  async (req, res) => {
    try {
      const result =
        await syncMetaAnalytics();

      res.json({
        success: true,
        message:
          "Meta analytics synced.",
        result,
      });
    } catch (error) {
      console.error(
        "Manual Meta sync error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          error.message ||
          "Meta sync failed.",
      });
    }
  }
);

module.exports = router;
