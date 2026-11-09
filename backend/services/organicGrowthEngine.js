"use strict";

const CATEGORY_RULES = [
  { category: "Toys", terms: /toy|toys|kids?|children|baby|puzzle|doll|car toy|blocks?/i, audience: ["parents", "gift shoppers", "toy enthusiasts"], interests: ["toys", "children's gifts", "family activities"] },
  { category: "Stationery", terms: /stationery|pen|pencil|notebook|school|office|marker|highlighter|art supplies/i, audience: ["students", "teachers", "office users"], interests: ["school supplies", "education", "office supplies"] },
  { category: "Gadgets", terms: /gadget|electronics?|tech|charger|cable|headphone|earbud|speaker|smart watch|power bank/i, audience: ["technology enthusiasts", "gadget shoppers", "practical tech buyers"], interests: ["consumer electronics", "mobile accessories", "technology"] },
  { category: "Photo frames", terms: /photo frame|picture frame|frame|wall decor|wall art/i, audience: ["gift buyers", "home decoration enthusiasts", "families"], interests: ["photo gifts", "home decor", "personalized gifts"] },
  { category: "Home accessories", terms: /home|decor|organizer|lamp|storage|cushion/i, audience: ["home makers", "home decoration enthusiasts", "gift shoppers"], interests: ["home organization", "home decor", "household accessories"] },
  { category: "Kitchen products", terms: /kitchen|cook|bottle|lunch box|utensil|food storage/i, audience: ["home cooks", "families", "practical household shoppers"], interests: ["kitchen accessories", "cooking", "household products"] },
  { category: "Gifts", terms: /gift|present|birthday|anniversary/i, audience: ["gift shoppers", "friends and families", "celebration planners"], interests: ["gift ideas", "birthday gifts", "celebration"] },
];

const safeText = (value) => String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
const slugWords = (value) => safeText(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
const unique = (values) => [...new Set(values.filter(Boolean))];

function detectProductAudience(product = {}) {
  const name = safeText(product.name);
  const categoryText = safeText(product.category);
  const tags = Array.isArray(product.tags) ? product.tags.map(safeText).join(" ") : "";
  const description = safeText(product.description);
  const source = [categoryText, name, tags, description].join(" ");
  const matched = CATEGORY_RULES.find((rule) => rule.terms.test(source));
  const category = categoryText || matched?.category || "General shopping";
  const rule = matched || { audience: ["online shoppers", "gift shoppers"], interests: ["online shopping", "product deals"] };
  return {
    category,
    audience: [...rule.audience],
    suggestedInterests: [...rule.interests],
    basis: categoryText ? "product_category_and_details" : matched ? "product_name_tags_and_description" : "general_product_context",
    researchNote: "Suggested audience hypotheses from product information; not Meta audience insights or verified buyer demographics.",
    productSignals: unique([name, ...slugWords(tags), ...slugWords(categoryText)]).slice(0, 12),
  };
}

function generateProductContent(product = {}, options = {}) {
  const name = safeText(product.name) || "Cart2Door product";
  const category = detectProductAudience(product).category;
  const description = safeText(product.description);
  const price = Number(product.price);
  const hasPrice = Number.isFinite(price) && price >= 0;
  const priceText = hasPrice ? `Rs. ${price.toLocaleString("en-PK")}` : "";
  const hooks = [
    `Looking for a useful ${category.toLowerCase()} pick? 👀`,
    `A simple find that can make your day easier: ${name} ✨`,
    `Need a gift or a practical everyday pick? Take a look at ${name} 🎁`,
  ];
  const captions = [
    `${name} — a handy option to explore at Cart2Door. ${priceText ? `Price: ${priceText}. ` : ""}Details and ordering are available on our website. 🇵🇰`,
    `Spotlight on ${name}! ${description ? `${description.slice(0, 180)} ` : ""}${priceText ? `Available for ${priceText}. ` : ""}Visit Cart2Door to check the details and order on WhatsApp.`,
    `Searching for ${category.toLowerCase()}? Have a look at ${name}. Save this post and visit Cart2Door when you are ready to order. 🛍️`,
  ];
  const categoryTags = {
    Toys: ["ToysPakistan", "KidsGifts", "ToyShopping"],
    Stationery: ["StationeryPakistan", "StudyEssentials", "SchoolSupplies"],
    Gadgets: ["GadgetsPakistan", "TechAccessories", "GadgetFinds"],
    "Photo frames": ["PhotoFrames", "GiftIdeasPakistan", "HomeDecorPakistan"],
    "Home accessories": ["HomeDecorPakistan", "HomeEssentials", "PakistanShopping"],
    "Kitchen products": ["KitchenEssentials", "HomeShoppingPakistan", "KitchenFinds"],
    Gifts: ["GiftIdeasPakistan", "GiftingPakistan", "PakistanShopping"],
  };
  const hashtags = unique(["Cart2Door", "PakistanShopping", ...(categoryTags[category] || ["OnlineShoppingPakistan"])])
    .map((tag) => `#${tag}`);
  const seed = Math.abs(Number(options.variant) || 0) % hooks.length;
  return {
    productName: name,
    category,
    hook: hooks[seed],
    caption: captions[seed],
    captionVariants: captions,
    hookVariants: hooks,
    hashtags,
    description: description || "Product details have not been provided. Confirm specifications before making additional claims.",
    callToAction: "Product details dekhein aur order ke liye Cart2Door par WhatsApp karein.",
    language: "Pakistani English with simple Urdu-friendly phrasing",
    generatedWithoutExternalAI: true,
    claimsPolicy: "Only supplied product name, description and price are used; no unsupported quality, discount, stock or delivery claims are added.",
  };
}

function getPakistanParts(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi", weekday: "short", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function analyzePostingTimes(posts = []) {
  const valid = posts.filter((post) => {
    const metrics = post.metrics || post;
    return post.publishedAt && getPakistanParts(post.publishedAt)
      && [metrics.views, metrics.likes, metrics.comments, metrics.shares].some((value) => Number(value) > 0);
  });
  if (valid.length < 3) {
    return {
      available: false,
      reason: "At least 3 published posts with non-zero recorded performance metrics are required.",
      sampleSize: valid.length,
      timezone: "Asia/Karachi",
      recommendations: [],
    };
  }
  const groups = new Map();
  for (const post of valid) {
    const parts = getPakistanParts(post.publishedAt);
    const key = `${parts.weekday} ${String(parts.hour).padStart(2, "0")}:00`;
    const metrics = post.metrics || post;
    const views = Number(metrics.views) || 0;
    const interactions = (Number(metrics.likes) || 0) + (Number(metrics.comments) || 0) + (Number(metrics.shares) || 0);
    const score = views > 0 ? interactions / views : 0;
    const current = groups.get(key) || { slot: key, posts: 0, scoreTotal: 0, views: 0, interactions: 0 };
    current.posts += 1;
    current.scoreTotal += score;
    current.views += views;
    current.interactions += interactions;
    groups.set(key, current);
  }
  const recommendations = [...groups.values()]
    .filter((item) => item.posts >= 2 && item.views > 0)
    .map((item) => ({ ...item, averageEngagementRate: item.scoreTotal / item.posts }))
    .sort((a, b) => b.averageEngagementRate - a.averageEngagementRate)
    .slice(0, 5);
  return {
    available: recommendations.length > 0,
    reason: recommendations.length ? "" : "More posts in repeated Pakistan-time slots are needed before recommending a best time.",
    sampleSize: valid.length,
    timezone: "Asia/Karachi",
    recommendations,
  };
}

function summarizeMetrics(records = []) {
  const valid = records.filter((item) => [item.views, item.likes, item.comments, item.shares].some((value) => Number(value) > 0));
  if (!valid.length) return { available: false, reason: "No non-zero published-post metrics are recorded for this period.", postsWithMetrics: 0 };
  const total = valid.reduce((sum, item) => ({
    views: sum.views + (Number(item.views) || 0),
    likes: sum.likes + (Number(item.likes) || 0),
    comments: sum.comments + (Number(item.comments) || 0),
    shares: sum.shares + (Number(item.shares) || 0),
  }), { views: 0, likes: 0, comments: 0, shares: 0 });
  const interactions = total.likes + total.comments + total.shares;
  return { available: true, postsWithMetrics: valid.length, ...total, engagementRate: total.views > 0 ? interactions / total.views : null };
}

module.exports = { detectProductAudience, generateProductContent, analyzePostingTimes, summarizeMetrics, getPakistanParts };
