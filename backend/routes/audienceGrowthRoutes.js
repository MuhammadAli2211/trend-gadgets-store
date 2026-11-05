const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");

const { protect, adminOnly } = require("../middleware/authMiddleware");
const Product = require("../models/Product");
const SocialAccount = require("../models/SocialAccount");
const Analytics = require("../models/Analytics");
const AudienceProspect = require("../models/AudienceProspect");
const AudienceEngagement = require("../models/AudienceEngagement");
const AudienceGrowthSnapshot = require("../models/AudienceGrowthSnapshot");
const AudienceReferralCampaign = require("../models/AudienceReferralCampaign");
const AudienceReferralEvent = require("../models/AudienceReferralEvent");
const AudienceAutomationRun = require("../models/AudienceAutomationRun");

const router = express.Router();
const metaApi = axios.create({ timeout: 15_000, proxy: false });
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v24.0";
const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const INSTAGRAM_GRAPH_BASE = `https://graph.instagram.com/${META_GRAPH_VERSION}`;
const MAX_AUTOMATION_COMMENTS = 60;
const INTEREST_TERMS = /\b(price|cost|rate|available|availability|order|buy|purchase|deliver|delivery|shipping|size|colour|color|price|kitne|qeemat|keemat|milay|milta|milega|order|chahiye|mangwa|bhej|delivery|karachi|lahore|islamabad|pakistan)\b/i;
const PRODUCT_CATEGORIES = [
  "Stationery", "Toys", "Home accessories", "Kitchen products", "Gifts", "Shopping",
  "Karachi online shopping", "Pakistan online shopping",
];

const normalizeHandle = (value) => String(value || "").trim().replace(/^@+/, "").toLowerCase().slice(0, 120);
const publicProductUrl = (productId) => `${String(process.env.FRONTEND_URL || "https://trend-gadgets-storefront.vercel.app").replace(/\/+$/, "")}/product/${productId}`;
const publicApiUrl = () => String(process.env.BACKEND_PUBLIC_URL || "https://trend-gadgets-api.vercel.app").replace(/\/+$/, "");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pakistanDayStart = (now = new Date()) => {
  const pakistanNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return new Date(Date.UTC(pakistanNow.getUTCFullYear(), pakistanNow.getUTCMonth(), pakistanNow.getUTCDate()) - 5 * 60 * 60 * 1000);
};
const redactPhoneNumbers = (value) => String(value || "").replace(/(?:\+?\d[\d ().-]{7,}\d)/g, "[phone]");

const n8nOnly = (req, res, next) => {
  const expected = process.env.N8N_API_KEY;
  const supplied = req.get("x-n8n-key") || "";
  if (!expected || expected.length < 32) {
    return res.status(503).json({ success: false, message: "Internal automation integration is not configured." });
  }
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return res.status(401).json({ success: false, message: "Unauthorized automation request." });
  }
  return next();
};

const classifyComment = (text) => {
  const normalized = String(text || "").trim();
  if (!normalized || !INTEREST_TERMS.test(normalized)) return null;
  const intent = /\b(order|buy|purchase|chahiye|mangwa)\b/i.test(normalized) ? "purchase_interest" : "product_inquiry";
  return {
    intent,
    replyDraft: "Thanks for your interest in Cart2Door. Please see the product details on our website or message us on WhatsApp for help with your order.",
  };
};

const getProductContext = async () => {
  const products = await Product.find({ isActive: true, deletedAt: null })
    .select("name category tags price")
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  const categorySet = new Set(PRODUCT_CATEGORIES);
  for (const product of products) if (product.category) categorySet.add(String(product.category).trim());
  const keywords = [...new Set(products.flatMap((product) => [product.name, product.category, ...(product.tags || [])])
    .map((value) => String(value || "").trim()).filter(Boolean))].slice(0, 150);
  return { products, categories: [...categorySet].sort(), keywords };
};

const getProspectCategory = (text, products) => {
  const normalized = String(text || "").toLowerCase();
  const match = products.find((product) => {
    const terms = [product.name, product.category, ...(product.tags || [])].filter(Boolean);
    return terms.some((term) => String(term).length > 2 && normalized.includes(String(term).toLowerCase()));
  });
  return match?.category || "Shopping";
};

const upsertEngagement = async ({ platform, comment, media, products }) => {
  const text = redactPhoneNumbers(String(comment?.text || comment?.message || "").trim()).slice(0, 1200);
  const actor = comment?.username || comment?.from?.name || "";
  const classification = classifyComment(text);
  if (!classification || !actor) return false;

  const normalizedHandle = normalizeHandle(actor);
  const externalId = String(comment.id || "").slice(0, 180);
  if (!externalId) return false;
  const category = getProspectCategory(text, products);
  const source = `${platform}_comment`;
  const eventKey = crypto.createHash("sha256").update(`${platform}:${externalId}`).digest("hex");
  await AudienceEngagement.findOneAndUpdate(
    { eventKey },
    {
      $set: {
        platform,
        externalId,
        mediaId: String(media?.id || ""),
        actorHandle: String(actor).slice(0, 120),
        commentText: text,
        contentUrl: String(media?.permalink || media?.permalink_url || "").slice(0, 500),
        category,
        intent: classification.intent,
        replyDraft: classification.replyDraft,
      },
      $setOnInsert: { status: "pending_review" },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await AudienceProspect.findOneAndUpdate(
    { platform, normalizedHandle },
    {
      $set: {
        handle: String(actor).slice(0, 120),
        contentUrl: String(media?.permalink || media?.permalink_url || "").slice(0, 500),
        category,
        source,
        interestSignals: [classification.intent],
        lastSeenAt: new Date(),
      },
      $setOnInsert: {
        normalizedHandle,
        profileUrl: platform === "instagram" ? `https://www.instagram.com/${encodeURIComponent(normalizedHandle)}/` : "",
        status: "review",
        firstSeenAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return true;
};

const scanOwnedComments = async () => {
  const products = (await getProductContext()).products;
  const warnings = [];
  const totals = { instagram: 0, facebook: 0, prospectsAddedOrUpdated: 0 };

  const instagram = await SocialAccount.findOne({ platform: "instagram", status: "connected", accessToken: { $ne: "" } }).sort({ updatedAt: -1 });
  if (instagram) {
    const igId = instagram.instagramAccountId || instagram.accountId;
    try {
      const instagramGraphBase = instagram.tokenType === "facebook_login" ? GRAPH_BASE : INSTAGRAM_GRAPH_BASE;
      const mediaResponse = await metaApi.get(`${instagramGraphBase}/${encodeURIComponent(igId)}/media`, {
        params: { fields: "id,permalink,timestamp", limit: 5, access_token: instagram.accessToken }, timeout: 12000,
      });
      for (const media of (mediaResponse.data?.data || []).slice(0, 5)) {
        const commentsResponse = await metaApi.get(`${instagramGraphBase}/${encodeURIComponent(media.id)}/comments`, {
          params: { fields: "id,text,username,timestamp", limit: 50, access_token: instagram.accessToken }, timeout: 12000,
        });
        for (const comment of (commentsResponse.data?.data || []).slice(0, MAX_AUTOMATION_COMMENTS)) {
          totals.instagram += 1;
          if (await upsertEngagement({ platform: "instagram", comment, media, products })) totals.prospectsAddedOrUpdated += 1;
        }
      }
    } catch (error) {
      const code = error.response?.data?.error?.code;
      warnings.push({ platform: "instagram", message: code ? `Meta API did not allow comment reading (code ${code}); check Instagram comment permissions.` : "Instagram comment scan failed; check the connection and permissions." });
    }
  } else {
    warnings.push({ platform: "instagram", message: "Instagram account is not connected." });
  }

  const facebook = await SocialAccount.findOne({ platform: "facebook", status: "connected", accessToken: { $ne: "" } }).sort({ updatedAt: -1 });
  if (facebook) {
    const pageId = facebook.pageId || facebook.accountId;
    try {
      const postsResponse = await metaApi.get(`${GRAPH_BASE}/${encodeURIComponent(pageId)}/posts`, {
        params: { fields: "id,permalink_url,created_time,comments.limit(50){id,message,from,created_time}", limit: 5, access_token: facebook.accessToken }, timeout: 12000,
      });
      for (const post of (postsResponse.data?.data || []).slice(0, 5)) {
        const media = { id: post.id, permalink: post.permalink_url };
        for (const comment of (post.comments?.data || []).slice(0, MAX_AUTOMATION_COMMENTS)) {
          totals.facebook += 1;
          if (await upsertEngagement({ platform: "facebook", comment, media, products })) totals.prospectsAddedOrUpdated += 1;
        }
      }
    } catch (error) {
      const code = error.response?.data?.error?.code;
      warnings.push({ platform: "facebook", message: code ? `Meta API did not allow comment reading (code ${code}); check Page engagement permissions.` : "Facebook comment scan failed; check the connection and permissions." });
    }
  } else {
    warnings.push({ platform: "facebook", message: "Facebook Page is not connected." });
  }

  return { ...totals, warnings, repliesSent: 0, message: "Interested comments were saved for admin review; no public replies or DMs were sent." };
};

const collectGrowthSnapshots = async () => {
  const capturedDate = new Date();
  capturedDate.setUTCHours(0, 0, 0, 0);
  const accounts = await SocialAccount.find({ platform: { $in: ["facebook", "instagram"] }, status: "connected", accessToken: { $ne: "" } }).sort({ updatedAt: -1 });
  const latest = new Map();
  for (const account of accounts) if (!latest.has(account.platform)) latest.set(account.platform, account);
  const collected = [];
  const warnings = [];

  for (const [platform, account] of latest) {
    try {
      const graphBase = platform === "instagram"
        ? account.tokenType === "facebook_login" ? GRAPH_BASE : INSTAGRAM_GRAPH_BASE
        : GRAPH_BASE;
      const accountId = platform === "instagram" ? account.instagramAccountId || account.accountId : account.pageId || account.accountId;
      const fields = platform === "instagram" ? "followers_count" : "followers_count,fan_count";
      const response = await metaApi.get(`${graphBase}/${encodeURIComponent(accountId)}`, {
        params: { fields, access_token: account.accessToken }, timeout: 10000,
      });
      const followers = Number(response.data?.followers_count ?? response.data?.fan_count);
      if (!Number.isFinite(followers) || followers < 0) throw new Error("Follower metric unavailable");
      await AudienceGrowthSnapshot.findOneAndUpdate(
        { platform, capturedDate },
        { $set: { followers, source: "meta_api" }, $setOnInsert: { platform, capturedDate } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      collected.push({ platform, followers });
    } catch (error) {
      const code = error.response?.data?.error?.code;
      warnings.push({ platform, message: code ? `Follower count not available from Meta (code ${code}); check approved insights permissions.` : "Follower count could not be read; check approved insights permissions." });
    }
  }
  if (collected.length === 0 && latest.size === 0) warnings.push({ platform: "all", message: "Connect an account before collecting follower counts." });
  return { collected, warnings, capturedDate };
};

const buildDashboard = async () => {
  const dayStart = pakistanDayStart();
  const [prospects, newToday, potentialCustomers, pendingEngagements, snapshots, referralCount, dailyReferralCount, categories, socialAccounts, interactionCount, storeMetrics, recentRuns] = await Promise.all([
    AudienceProspect.countDocuments({}),
    AudienceProspect.countDocuments({ createdAt: { $gte: dayStart } }),
    AudienceProspect.countDocuments({ status: { $in: ["new", "review", "invited"] } }),
    AudienceEngagement.countDocuments({ status: "pending_review" }),
    AudienceGrowthSnapshot.find({}).sort({ capturedDate: -1 }).limit(60).lean(),
    AudienceReferralEvent.countDocuments({}),
    AudienceReferralEvent.countDocuments({ createdAt: { $gte: dayStart } }),
    AudienceProspect.distinct("category", { category: { $ne: "" } }),
    SocialAccount.find({ platform: { $in: ["facebook", "instagram"] }, status: "connected" }).select("platform accountName").lean(),
    AudienceEngagement.countDocuments({ createdAt: { $gte: dayStart } }),
    Analytics.aggregate([
      { $match: { createdAt: { $gte: dayStart }, platform: { $in: ["website", "whatsapp"] } } },
      { $group: { _id: null, websiteVisits: { $sum: "$views" }, whatsappClicks: { $sum: "$whatsappClicks" } } },
    ]),
    AudienceAutomationRun.find({}).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  const latestFollowers = {};
  for (const snapshot of snapshots) if (latestFollowers[snapshot.platform] === undefined) latestFollowers[snapshot.platform] = snapshot.followers;
  const connected = new Set(socialAccounts.map((item) => item.platform));
  return {
    totals: { prospects, newToday, potentialCustomers, pendingEngagements, referralVisits: referralCount, referralVisitsToday: dailyReferralCount, profileEngagementsToday: interactionCount, websiteVisitsToday: storeMetrics[0]?.websiteVisits || 0, whatsappClicksToday: storeMetrics[0]?.whatsappClicks || 0 },
    followers: { facebook: latestFollowers.facebook ?? null, instagram: latestFollowers.instagram ?? null },
    growth: snapshots.reverse().map(({ platform, capturedDate, followers }) => ({ platform, date: capturedDate, followers })),
    categories: categories.sort(),
    connectedAccounts: { facebook: connected.has("facebook"), instagram: connected.has("instagram") },
    recentRuns,
    capabilities: {
      commentMonitoring: true,
      publicHashtagDiscovery: false,
      publicHashtagDiscoveryNote: "This app's current Instagram login does not include approved public-content hashtag access. Enable the official Meta feature and required permissions before discovery can run.",
      autoReply: false,
      autoReplyNote: "Replies are saved as drafts for review; this module does not send public replies or DMs.",
      facebookInvites: "Manual review in Meta Business Suite only; no simulated clicks or automatic invitations.",
    },
  };
};

const getInternalProducts = async () => {
  const { products, categories, keywords } = await getProductContext();
  const socialAccounts = await SocialAccount.find({ platform: { $in: ["facebook", "instagram"] }, status: "connected" }).select("platform accountName tokenType").lean();
  return {
    success: true,
    categories,
    keywords,
    products: products.map(({ _id, name, category, tags, price }) => ({ id: String(_id), name, category, tags, price })),
    connectedAccounts: socialAccounts.map(({ platform, accountName, tokenType }) => ({ platform, accountName, tokenType })),
    restrictions: [
      "Meta tokens remain in the backend and are never returned to n8n.",
      "Only official Meta API endpoints are used; unsupported public account scraping is disabled.",
      "Reply drafts require admin review. No unsolicited DMs, follow/unfollow, likes, or comments are sent.",
    ],
  };
};

// Internal n8n context. This is deliberately read-only and token-free.
router.get("/internal/context", n8nOnly, async (req, res) => {
  try { return res.json(await getInternalProducts()); }
  catch (error) { console.error("Audience context failed:", error.message); return res.status(500).json({ success: false, message: "Unable to load audience context." }); }
});

router.post("/internal/discovery/scan", n8nOnly, async (req, res) => {
  try { return res.json({ success: true, ...(await scanOwnedComments()) }); }
  catch (error) { console.error("Audience discovery scan failed:", error.message); return res.status(500).json({ success: false, message: "Audience scan failed." }); }
});

router.get("/internal/discovery/targets", n8nOnly, async (req, res) => {
  try {
    const { categories, keywords } = await getProductContext();
    return res.json({ success: true, categories, keywords: keywords.slice(0, 60), publicHashtagDiscoveryEnabled: false, note: "This endpoint prepares Cart2Door search topics. The connected Meta app currently lacks approved public-content hashtag discovery, so it does not scrape or request third-party content." });
  } catch (error) { console.error("Audience target preparation failed:", error.message); return res.status(500).json({ success: false, message: "Unable to prepare discovery topics." }); }
});

router.post("/internal/prospects/dedupe", n8nOnly, async (req, res) => {
  try {
    const duplicates = await AudienceProspect.aggregate([
      { $group: { _id: { platform: "$platform", handle: "$normalizedHandle" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: "groups" },
    ]);
    return res.json({ success: true, duplicateGroups: duplicates[0]?.groups || 0, uniqueness: "New prospect records are deduplicated by platform and normalized handle." });
  } catch (error) { console.error("Audience prospect dedupe check failed:", error.message); return res.status(500).json({ success: false, message: "Unable to check prospect duplicates." }); }
});

router.post("/internal/engagements/classify-pending", n8nOnly, async (req, res) => {
  try {
    const pending = await AudienceEngagement.countDocuments({ status: "pending_review" });
    return res.json({ success: true, pendingReview: pending, repliesSent: 0, message: "Inquiry drafts remain pending admin review; no messages were sent." });
  } catch (error) { console.error("Audience classification status failed:", error.message); return res.status(500).json({ success: false, message: "Unable to read inquiry queue." }); }
});

router.post("/internal/runs", n8nOnly, async (req, res) => {
  try {
    const workflowName = String(req.body?.workflowName || "").trim().slice(0, 100);
    const status = ["success", "warning", "failed"].includes(req.body?.status) ? req.body.status : "warning";
    if (!workflowName) return res.status(400).json({ success: false, message: "Workflow name is required." });
    const run = await AudienceAutomationRun.create({
      workflowName,
      status,
      summary: String(req.body?.summary || "").trim().slice(0, 500),
      errorMessage: String(req.body?.errorMessage || "").trim()
        .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
        .replace(/([?&](?:access_token|token|api_key)=)[^&\s]+/gi, "$1[redacted]")
        .replace(/((?:token|secret|key)\s*[:=]\s*)\S+/gi, "$1[redacted]")
        .slice(0, 500),
      finishedAt: new Date(),
    });
    return res.status(201).json({ success: true, runId: run._id });
  } catch (error) { console.error("Audience run log failed:", error.message); return res.status(500).json({ success: false, message: "Unable to save automation run." }); }
});

router.post("/internal/prospects/upsert", n8nOnly, async (req, res) => {
  try {
    const input = Array.isArray(req.body?.prospects) ? req.body.prospects.slice(0, 100) : [];
    const results = [];
    for (const item of input) {
      const platform = ["instagram", "facebook", "other"].includes(item?.platform) ? item.platform : null;
      const handle = String(item?.handle || "").trim().replace(/^@+/, "").slice(0, 120);
      const normalizedHandle = normalizeHandle(handle);
      if (!platform || !normalizedHandle) continue;
      const profileUrl = String(item.profileUrl || "").slice(0, 500);
      const contentUrl = String(item.contentUrl || "").slice(0, 500);
      const category = String(item.category || "").trim().slice(0, 80);
      const location = String(item.location || "").trim().slice(0, 80);
      const source = ["manual", "instagram_comment", "facebook_comment", "mention", "hashtag", "referral"].includes(item.source) ? item.source : "manual";
      await AudienceProspect.findOneAndUpdate(
        { platform, normalizedHandle },
        { $set: { handle, profileUrl, contentUrl, category, location, source, lastSeenAt: new Date() }, $setOnInsert: { normalizedHandle, status: "review", firstSeenAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      results.push({ platform, handle });
    }
    return res.json({ success: true, processed: results.length, message: "Prospects are deduplicated by platform and account handle." });
  } catch (error) {
    console.error("Audience prospect upsert failed:", error.message);
    return res.status(500).json({ success: false, message: "Unable to save prospects." });
  }
});

router.post("/internal/snapshots/collect", n8nOnly, async (req, res) => {
  try { return res.json({ success: true, ...(await collectGrowthSnapshots()) }); }
  catch (error) { console.error("Audience snapshot failed:", error.message); return res.status(500).json({ success: false, message: "Unable to collect growth metrics." }); }
});

router.get("/internal/invites/queue", n8nOnly, async (req, res) => {
  const prospects = await AudienceProspect.find({ platform: "facebook", status: { $in: ["new", "review"] } })
    .sort({ updatedAt: -1 }).limit(100).select("handle profileUrl contentUrl category status").lean();
  return res.json({ success: true, requiresManualReview: true, metaBusinessSuiteUrl: "https://business.facebook.com/", prospects });
});

router.get("/internal/referrals/report", n8nOnly, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const campaigns = await AudienceReferralCampaign.aggregate([
      { $match: { isActive: true } },
      { $lookup: { from: "audiencereferralevents", localField: "_id", foreignField: "campaign", as: "events" } },
      { $project: { code: 1, product: 1, totalVisits: { $size: "$events" }, recentVisits: { $size: { $filter: { input: "$events", as: "event", cond: { $gte: ["$$event.createdAt", since] } } } } } },
    ]);
    return res.json({ success: true, campaigns });
  } catch (error) { console.error("Referral report failed:", error.message); return res.status(500).json({ success: false, message: "Unable to load referral report." }); }
});

router.get("/runs", protect, adminOnly, async (req, res) => {
  const runs = await AudienceAutomationRun.find({}).sort({ createdAt: -1 }).limit(50).lean();
  return res.json({ success: true, runs });
});

router.get("/dashboard", protect, adminOnly, async (req, res) => {
  try { return res.json({ success: true, ...(await buildDashboard()) }); }
  catch (error) { console.error("Audience dashboard failed:", error.message); return res.status(500).json({ success: false, message: "Unable to load audience growth." }); }
});

router.get("/prospects", protect, adminOnly, async (req, res) => {
  try {
    const filter = {};
    const { platform, category, location, status, date, search } = req.query;
    if (["instagram", "facebook", "other"].includes(platform)) filter.platform = platform;
    if (typeof category === "string" && category.trim()) filter.category = category.trim().slice(0, 80);
    if (typeof location === "string" && location.trim()) filter.location = new RegExp(escapeRegex(location.trim().slice(0, 80)), "i");
    if (["new", "review", "invited", "followed", "customer", "not_interested"].includes(status)) filter.status = status;
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split("-").map(Number);
      const from = new Date(Date.UTC(year, month - 1, day) - 5 * 60 * 60 * 1000);
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
      filter.createdAt = { $gte: from, $lt: to };
    }
    if (typeof search === "string" && search.trim()) {
      const term = new RegExp(escapeRegex(search.trim().slice(0, 80)), "i");
      filter.$or = [{ handle: term }, { category: term }, { location: term }];
    }
    const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
    const [prospects, total] = await Promise.all([
      AudienceProspect.find(filter).sort({ lastSeenAt: -1 }).skip((page - 1) * 50).limit(50).lean(),
      AudienceProspect.countDocuments(filter),
    ]);
    return res.json({ success: true, prospects, total, page, pageSize: 50 });
  } catch (error) { console.error("Audience prospects failed:", error.message); return res.status(500).json({ success: false, message: "Unable to load prospects." }); }
});

router.patch("/prospects/:id/status", protect, adminOnly, async (req, res) => {
  const statuses = ["new", "review", "invited", "followed", "customer", "not_interested"];
  if (!mongoose.isValidObjectId(req.params.id) || !statuses.includes(req.body?.status)) return res.status(400).json({ success: false, message: "Choose a valid prospect status." });
  const prospect = await AudienceProspect.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!prospect) return res.status(404).json({ success: false, message: "Prospect not found." });
  return res.json({ success: true, prospect });
});

router.get("/engagements", protect, adminOnly, async (req, res) => {
  const filter = {};
  if (["pending_review", "replied_manually", "ignored"].includes(req.query.status)) filter.status = req.query.status;
  if (["facebook", "instagram"].includes(req.query.platform)) filter.platform = req.query.platform;
  const engagements = await AudienceEngagement.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  return res.json({ success: true, engagements });
});

router.patch("/engagements/:id/review", protect, adminOnly, async (req, res) => {
  const status = req.body?.status;
  if (!mongoose.isValidObjectId(req.params.id) || !["replied_manually", "ignored", "pending_review"].includes(status)) return res.status(400).json({ success: false, message: "Choose a valid review status." });
  const engagement = await AudienceEngagement.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!engagement) return res.status(404).json({ success: false, message: "Engagement not found." });
  return res.json({ success: true, engagement });
});

router.get("/campaigns", protect, adminOnly, async (req, res) => {
  const campaigns = await AudienceReferralCampaign.find({}).sort({ createdAt: -1 }).limit(100).populate("product", "name price images").lean();
  const ids = campaigns.map((item) => item._id);
  const counts = await AudienceReferralEvent.aggregate([{ $match: { campaign: { $in: ids } } }, { $group: { _id: "$campaign", visits: { $sum: 1 } } }]);
  const visits = new Map(counts.map((item) => [String(item._id), item.visits]));
  return res.json({ success: true, campaigns: campaigns.map((item) => ({ ...item, visits: visits.get(String(item._id)) || 0, shareUrl: `${publicApiUrl()}/api/audience-growth/referral/${item.code}` })) });
});

router.post("/campaigns", protect, adminOnly, async (req, res) => {
  const productId = String(req.body?.productId || "");
  if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ success: false, message: "Choose a valid product." });
  const product = await Product.findOne({ _id: productId, isActive: true, deletedAt: null }).select("name price category").lean();
  if (!product) return res.status(404).json({ success: false, message: "Active product not found." });
  const code = crypto.randomBytes(6).toString("hex");
  const caption = String(req.body?.caption || `${product.name} — Rs. ${product.price}. Shop at Cart2Door and order on WhatsApp.`).trim().slice(0, 1000);
  const campaign = await AudienceReferralCampaign.create({ code, product: product._id, caption, createdBy: req.user._id });
  return res.status(201).json({ success: true, campaign: { id: campaign._id, code, product, caption, shareUrl: `${publicApiUrl()}/api/audience-growth/referral/${code}` } });
});

router.post("/snapshots/collect", protect, adminOnly, async (req, res) => {
  try { return res.json({ success: true, ...(await collectGrowthSnapshots()) }); }
  catch (error) { console.error("Audience snapshot failed:", error.message); return res.status(500).json({ success: false, message: "Unable to collect growth metrics." }); }
});

router.get("/referral/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").toLowerCase().slice(0, 32);
    const campaign = await AudienceReferralCampaign.findOne({ code, isActive: true }).select("_id product").lean();
    if (!campaign) return res.status(404).json({ success: false, message: "Referral campaign not found." });
    await AudienceReferralEvent.create({ campaign: campaign._id, product: campaign.product });
    const destination = new URL(publicProductUrl(campaign.product));
    destination.searchParams.set("utm_source", "share");
    destination.searchParams.set("utm_medium", "referral");
    destination.searchParams.set("utm_campaign", code);
    return res.redirect(302, destination.toString());
  } catch (error) { console.error("Referral redirect failed:", error.message); return res.status(500).json({ success: false, message: "Unable to open referral link." }); }
});

const pakistanDateKey = (date = new Date()) => {
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
};

// One protected Vercel Cron invocation runs the daily, non-posting growth tasks.
// A database lease prevents duplicate work if a cron invocation overlaps or retries.
const runDailyAudienceGrowth = async () => {
  const dateKey = pakistanDateKey();
  const owner = crypto.randomUUID();
  const locks = mongoose.connection.collection("audience_growth_worker_locks");
  const now = new Date();

  try {
    await locks.findOneAndUpdate(
      {
        _id: "daily-audience-growth",
        completedDate: { $ne: dateKey },
        $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }],
      },
      {
        $set: { owner, leaseUntil: new Date(now.getTime() + 6 * 60 * 1000) },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await locks.findOne({ _id: "daily-audience-growth" });
    return {
      success: true,
      skipped: true,
      reason: existing?.completedDate === dateKey
        ? "Today's audience-growth run is already complete."
        : "An audience-growth run is already in progress.",
      date: dateKey,
    };
  }

  const results = [];
  const recordTask = async (workflowName, task, summarize) => {
    try {
      const data = await task();
      const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
      const status = warnings.length ? "warning" : "success";
      const summary = String(summarize(data)).slice(0, 500);
      const errorMessage = warnings
        .map((item) => `${item.platform ? `${item.platform}: ` : ""}${item.message || "A required permission or data source was unavailable."}`)
        .join(" ")
        .slice(0, 500);
      await AudienceAutomationRun.create({ workflowName, status, summary, errorMessage });
      results.push({ workflowName, status, summary, warnings: warnings.length });
    } catch (error) {
      console.error(`Daily audience task failed (${workflowName}):`, error.message);
      await AudienceAutomationRun.create({
        workflowName,
        status: "failed",
        summary: "Daily task failed; see backend logs for details.",
        errorMessage: "The task did not complete. It will be attempted again on the next daily run.",
      });
      results.push({ workflowName, status: "failed", summary: "Task failed; see backend logs." });
    }
  };

  try {
    await recordTask("Daily audience topics", async () => {
      const { categories, keywords } = await getProductContext();
      return { categories, keywords: keywords.slice(0, 60) };
    }, (data) => `Prepared ${data.keywords.length} product search topics across ${data.categories.length} categories; public scraping is disabled.`);

    await recordTask("Comment monitoring", scanOwnedComments, (data) =>
      `Scanned ${data.instagram} Instagram and ${data.facebook} Facebook comments; saved ${data.prospectsAddedOrUpdated} interested-comment records for admin review. No replies or DMs were sent.`);

    await recordTask("Prospect duplicate check", async () => {
      const duplicates = await AudienceProspect.aggregate([
        { $group: { _id: { platform: "$platform", handle: "$normalizedHandle" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $count: "groups" },
      ]);
      return { duplicateGroups: duplicates[0]?.groups || 0 };
    }, (data) => `Found ${data.duplicateGroups} duplicate prospect groups.`);

    await recordTask("Inquiry review queue", async () => ({
      pendingReview: await AudienceEngagement.countDocuments({ status: "pending_review" }),
      repliesSent: 0,
    }), (data) => `${data.pendingReview} inquiries are waiting for admin review; no replies were sent.`);

    await recordTask("Facebook invite review queue", async () => ({
      pendingManualReview: await AudienceProspect.countDocuments({ platform: "facebook", status: { $in: ["new", "review"] } }),
    }), (data) => `${data.pendingManualReview} prospects are available for manual review in Meta Business Suite; no invitations were sent.`);

    await recordTask("Daily growth metrics", collectGrowthSnapshots, (data) =>
      `Saved follower snapshots for ${data.collected.length} platform(s).`);

    await recordTask("Referral campaign report", async () => {
      const [campaigns, visits] = await Promise.all([
        AudienceReferralCampaign.countDocuments({ isActive: true }),
        AudienceReferralEvent.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
      ]);
      return { campaigns, visits };
    }, (data) => `Reported ${data.campaigns} active referral campaigns and ${data.visits} visits in the last 30 days.`);

    const failures = results.filter((item) => item.status === "failed").length;
    const warnings = results.filter((item) => item.status === "warning").length;
    await locks.updateOne(
      { _id: "daily-audience-growth", owner },
      { $set: { completedDate: dateKey, completedAt: new Date(), leaseUntil: new Date(0) }, $unset: { owner: "" } },
    );
    return { success: failures === 0, date: dateKey, tasks: results, failed: failures, warnings };
  } catch (error) {
    await locks.deleteOne({ _id: "daily-audience-growth", owner });
    throw error;
  }
};

router.runDailyAudienceGrowth = runDailyAudienceGrowth;

module.exports = router;
