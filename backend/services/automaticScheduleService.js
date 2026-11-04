const Product = require("../models/Product");
const Content = require("../models/Content");
const Schedule = require("../models/Schedule");
const SocialAccount = require("../models/SocialAccount");
const { getProductVideoAsset } = require("../utils/productVideo");

const PAKISTAN_OFFSET_MS = 5 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MIN_REPEAT_DAYS = 7;
// 8:00 AM–7:00 PM Pakistan time provides 84 weekly hourly slots, enough for
// the current 81 active products to repeat every 7 days without collisions.
const POSTING_HOURS = Array.from({ length: 12 }, (_, index) => index + 8);

const toPakistanParts = (date) => {
  const shifted = new Date(date.getTime() + PAKISTAN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
};

const isPostingHour = (date) => {
  const shifted = new Date(date.getTime() + PAKISTAN_OFFSET_MS);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  return POSTING_HOURS.includes(hour) && minute === 0;
};

const recurringGapIsFree = (candidate, occupiedTimes, repeatDays) => {
  const cycleMs = Math.max(MIN_REPEAT_DAYS, Number(repeatDays) || MIN_REPEAT_DAYS) * DAY_MS;
  return occupiedTimes.every((time) => {
    const rawGap = Math.abs(time - candidate) % cycleMs;
    const recurringGap = Math.min(rawGap, cycleMs - rawGap);
    return recurringGap >= HOUR_MS;
  });
};

const findNextFreePostingSlot = (notBefore, occupiedTimes, repeatDays) => {
  const minimum = Math.max(Date.now(), new Date(notBefore || Date.now()).getTime());
  const pakistanDate = toPakistanParts(new Date(minimum));
  const firstDayUtc = Date.UTC(pakistanDate.year, pakistanDate.month, pakistanDate.day);

  for (let day = 0; day < 366; day += 1) {
    for (const hour of POSTING_HOURS) {
      const candidate = firstDayUtc + day * DAY_MS + hour * HOUR_MS - PAKISTAN_OFFSET_MS;
      if (candidate < minimum) continue;
      if (!recurringGapIsFree(candidate, occupiedTimes, repeatDays)) continue;
      return new Date(candidate);
    }
  }

  return null;
};

const ensureAutomaticSchedules = async () => {
  const connectedFacebook = await SocialAccount.exists({ platform: "facebook", status: "connected" });
  const connectedInstagram = await SocialAccount.exists({ platform: "instagram", status: "connected" });
  if (!connectedFacebook || !connectedInstagram) {
    return { skipped: true, reason: "Connect both Facebook and Instagram to start automatic scheduling." };
  }

  const products = await Product.find({ isActive: { $ne: false }, deletedAt: null })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id createdAt images video videos");
  if (!products.length) return { created: 0, updated: 0, cancelledDuplicates: 0 };
  const repeatEveryDays = Math.max(MIN_REPEAT_DAYS, Math.ceil(products.length / POSTING_HOURS.length));

  const productIds = products.map((product) => product._id);
  const allContent = await Content.find({ product: { $in: productIds } })
    .sort({ createdAt: -1, _id: -1 })
    .select("_id product type platform caption media status generatedAutomatically audioMode createdBy createdAt");
  const productsById = new Map(products.map((product) => [String(product._id), product]));
  for (const content of allContent) {
    if (!content.generatedAutomatically) continue;
    const product = productsById.get(String(content.product));
    if (!product) continue;

    const productVideo = getProductVideoAsset(product);
    const productImage = (product.images || []).find((image) => image?.url);
    const media = productVideo?.url
      ? { url: productVideo.url, publicId: productVideo.publicId || "", resourceType: "video" }
      : productImage
        ? { url: productImage.url, publicId: productImage.publicId || "", resourceType: "image" }
        : null;
    if (!media) continue;

    const type = media.resourceType === "video" ? "reel" : "post";
    const audioMode = media.resourceType === "video" ? "original" : "none";
    const mediaChanged =
      content.type !== type ||
      content.media?.url !== media.url ||
      content.media?.publicId !== media.publicId ||
      content.media?.resourceType !== media.resourceType;
    if (mediaChanged || content.audioMode !== audioMode) {
      content.type = type;
      content.media = media;
      content.audioMode = audioMode;
      await content.save();
    }
  }
  const contentByProduct = new Map();
  const productByContentId = new Map();
  for (const content of allContent) {
    const productId = String(content.product);
    productByContentId.set(String(content._id), productId);
    if (!content.media?.url || !["approved", "scheduled", "published"].includes(content.status)) continue;
    if (!contentByProduct.has(productId)) contentByProduct.set(productId, []);
    contentByProduct.get(productId).push(content);
  }

  const contentIds = allContent.map((content) => content._id);
  const existingSchedules = contentIds.length
    ? await Schedule.find({ content: { $in: contentIds }, status: { $ne: "cancelled" } }).sort({ scheduledAt: 1, createdAt: 1 })
    : [];
  const schedulesByProduct = new Map();
  for (const schedule of existingSchedules) {
    const productId = productByContentId.get(String(schedule.content));
    if (!productId) continue;
    if (!schedulesByProduct.has(productId)) schedulesByProduct.set(productId, []);
    schedulesByProduct.get(productId).push(schedule);
  }

  const fixedSchedules = await Schedule.find({
    $or: [
      { autoManaged: true, status: "scheduled", scheduledAt: { $gt: new Date() } },
      { status: "processing" },
    ],
  }).select("scheduledAt lastRunAt status");
  const occupiedTimes = fixedSchedules.map((schedule) => new Date(
    schedule.status === "processing" ? schedule.lastRunAt || schedule.scheduledAt : schedule.scheduledAt
  ).getTime());
  let created = 0;
  let updated = 0;
  let cancelledDuplicates = 0;
  let deferred = 0;

  const plans = products.map((product) => {
    const productId = String(product._id);
    const productSchedules = schedulesByProduct.get(productId) || [];
    const eligibleContents = contentByProduct.get(productId) || [];
    const inProgress = productSchedules.find((schedule) => schedule.status === "processing");
    if (inProgress) return null;

    const scheduled = productSchedules.find((schedule) => schedule.status === "scheduled");
    const reusableSchedule = scheduled || productSchedules.find((schedule) => ["failed", "published"].includes(schedule.status));
    const scheduledContentId = reusableSchedule ? String(reusableSchedule.content) : "";
    const content = eligibleContents.find((item) => String(item._id) === scheduledContentId) || eligibleContents[0];
    if (!content) return null;

    const pendingPlatformRetry = Boolean(reusableSchedule?.retryOnlyFailed);
    const lastProductPostAt = productSchedules.reduce((latest, schedule) => {
      const timestamps = [
        schedule.publishedAt,
        ...(schedule.publishedPosts || []).filter((post) => post.success).map((post) => post.publishedAt),
      ];
      return timestamps.reduce((maxTime, timestamp) => {
        const value = timestamp ? new Date(timestamp).getTime() : 0;
        return Number.isFinite(value) ? Math.max(maxTime, value) : maxTime;
      }, latest);
    }, 0);
    const repeatStart = lastProductPostAt ? lastProductPostAt + repeatEveryDays * DAY_MS : Date.now();
    const oldTime = reusableSchedule?.scheduledAt ? new Date(reusableSchedule.scheduledAt).getTime() : 0;
    const notBefore = pendingPlatformRetry
      ? Math.max(Date.now(), oldTime)
      : Math.max(Date.now(), repeatStart, scheduled && oldTime > Date.now() ? oldTime : 0);
    return { productId, content, schedules: productSchedules, reusableSchedule, notBefore };
  }).filter(Boolean);

  plans.sort((a, b) => a.notBefore - b.notBefore || a.productId.localeCompare(b.productId));

  for (const plan of plans) {
    const current = plan.reusableSchedule;
    let scheduledAt;
    const currentScheduledAt = current?.scheduledAt ? new Date(current.scheduledAt) : null;
    const currentScheduledAtMs = currentScheduledAt?.getTime() || 0;
    const currentSlotIsDue = currentScheduledAtMs <= Date.now() && plan.notBefore <= Date.now();

    if (
      current?.autoManaged &&
      current.status === "scheduled" &&
      current.retryOnlyFailed
    ) {
      // Retries are short-lived (about a minute); preserve their exact time
      // and platform selection instead of moving them into the next daily slot.
      scheduledAt = currentScheduledAt;
      occupiedTimes.push(scheduledAt.getTime());
    } else if (
      current?.autoManaged &&
      current.status === "scheduled" &&
      isPostingHour(currentScheduledAt) &&
      (currentScheduledAtMs >= plan.notBefore || currentSlotIsDue)
    ) {
      // Keep an eligible overdue slot due so the worker can publish it below.
      // Moving it to the next future slot here made successful cron runs skip posts.
      scheduledAt = currentScheduledAt;
      occupiedTimes.push(scheduledAt.getTime());
    } else {
      scheduledAt = findNextFreePostingSlot(plan.notBefore, occupiedTimes, repeatEveryDays);
      if (!scheduledAt) {
        deferred += 1;
        continue;
      }
      occupiedTimes.push(scheduledAt.getTime());
    }

    let target = current;
    if (!target) {
      target = new Schedule({
        content: plan.content._id,
        createdBy: plan.content.createdBy,
      });
      created += 1;
    } else {
      updated += 1;
    }

    target.content = plan.content._id;
    target.platforms = ["facebook", "instagram"];
    target.platform = "facebook";
    target.scheduledAt = scheduledAt;
    target.repeatEnabled = true;
    target.repeatEvery = repeatEveryDays;
    target.repeatUnit = "days";
    target.generateNewContent = false;
    target.autoDeletePrevious = true;
    target.autoManaged = true;
    target.status = "scheduled";
    const preservePlatformRetry = Boolean(current?.retryOnlyFailed && current.status === "scheduled");
    if (!preservePlatformRetry) {
      target.retryOnlyFailed = false;
      target.retryCount = 0;
      target.retryForScheduledAt = null;
      target.errorMessage = "";
    }
    const mergedPublishedPosts = (target.publishedPosts || []).map((post) => post.toObject?.() || post);
    for (const duplicate of plan.schedules) {
      if (String(duplicate._id) === String(target._id)) continue;
      for (const post of duplicate.publishedPosts || []) {
        if (!post.success || !post.postId || !["facebook", "instagram"].includes(post.platform)) continue;
        const existingIndex = mergedPublishedPosts.findIndex((item) => item.platform === post.platform);
        const existingPost = existingIndex >= 0 ? mergedPublishedPosts[existingIndex] : null;
        const newerPost = !existingPost || new Date(post.publishedAt || 0) > new Date(existingPost.publishedAt || 0);
        if (newerPost) {
          if (existingIndex >= 0) mergedPublishedPosts[existingIndex] = post.toObject?.() || post;
          else mergedPublishedPosts.push(post.toObject?.() || post);
        }
      }
    }
    target.publishedPosts = mergedPublishedPosts;
    const facebookHistory = mergedPublishedPosts.find((post) => post.platform === "facebook" && post.success);
    if (facebookHistory?.postId) {
      target.publishedPostId = facebookHistory.postId;
      target.previousPublishedPostId = facebookHistory.postId;
    }
    if (!target.previousPublishedPostId && target.publishedPostId) {
      target.previousPublishedPostId = target.publishedPostId;
    }
    await target.save();

    plan.content.status = "scheduled";
    await plan.content.save();

    for (const duplicate of plan.schedules) {
      if (String(duplicate._id) === String(target._id) || duplicate.status === "processing") continue;
      duplicate.status = "cancelled";
      duplicate.autoManaged = false;
      duplicate.errorMessage = "Replaced by the product's single automatic Facebook and Instagram schedule.";
      await duplicate.save();
      cancelledDuplicates += 1;
    }
  }

  // Reconcile every active automatic schedule as a final safety pass. Some
  // older schedules can be missing from the product/content planning pass
  // (for example, if their content is no longer eligible), but they still
  // must respect the daytime posting window and one-hour spacing.
  const activeAutomaticSchedules = await Schedule.find({
    autoManaged: true,
    status: "scheduled",
  });
  const normalizationPlans = activeAutomaticSchedules.map((schedule) => {
    const publishedTimes = [
      schedule.publishedAt,
      ...(schedule.publishedPosts || []).map((post) => post.success ? post.publishedAt : null),
    ].filter(Boolean).map((timestamp) => new Date(timestamp).getTime()).filter(Number.isFinite);
    const lastPublishedAt = publishedTimes.length ? Math.max(...publishedTimes) : 0;
    return {
      schedule,
      notBefore: Math.max(Date.now(), lastPublishedAt ? lastPublishedAt + repeatEveryDays * DAY_MS : 0),
    };
  }).sort((a, b) => a.notBefore - b.notBefore || String(a.schedule._id).localeCompare(String(b.schedule._id)));
  const normalizedTimes = [];
  for (const plan of normalizationPlans) {
    const { schedule, notBefore } = plan;
    if (schedule.retryOnlyFailed) {
      // A failed-platform retry may intentionally be scheduled between the
      // normal top-of-hour slots. Leave it alone so the retry can run.
      normalizedTimes.push(new Date(schedule.scheduledAt).getTime());
      continue;
    }
    const currentTime = new Date(schedule.scheduledAt).getTime();
    const currentSlotIsDue =
      currentTime <= Date.now() &&
      notBefore <= Date.now() &&
      isPostingHour(new Date(currentTime));
    const nextTime = currentSlotIsDue
      ? new Date(currentTime)
      : findNextFreePostingSlot(notBefore, normalizedTimes, repeatEveryDays);

    if (!nextTime) {
      deferred += 1;
      continue;
    }

    const policyNeedsUpdate =
      schedule.repeatEnabled !== true ||
      Number(schedule.repeatEvery) !== repeatEveryDays ||
      schedule.repeatUnit !== "days" ||
      schedule.generateNewContent !== false ||
      schedule.autoDeletePrevious !== true ||
      JSON.stringify([...(schedule.platforms || [])].sort()) !== JSON.stringify(["facebook", "instagram"]) ||
      schedule.retryOnlyFailed === true ||
      Number(schedule.retryCount || 0) !== 0 ||
      Boolean(schedule.retryForScheduledAt) ||
      Boolean(schedule.errorMessage);

    if (nextTime.getTime() !== currentTime || policyNeedsUpdate) {
      schedule.scheduledAt = nextTime;
      schedule.repeatEnabled = true;
      schedule.repeatEvery = repeatEveryDays;
      schedule.repeatUnit = "days";
      schedule.generateNewContent = false;
      schedule.autoDeletePrevious = true;
      schedule.platforms = ["facebook", "instagram"];
      schedule.platform = "facebook";
      schedule.errorMessage = "";
      schedule.retryOnlyFailed = false;
      schedule.retryCount = 0;
      schedule.retryForScheduledAt = null;
      await schedule.save();
      updated += 1;
    }

    normalizedTimes.push(nextTime.getTime());
  }

  return { created, updated, cancelledDuplicates, deferred, products: plans.length };
};

// Add a newly-created product without reconciling every existing product
// schedule inside the product-save request. The full reconciliation still
// runs from the schedule worker/cron; this creates the new product's slot
// immediately with the same daytime and repeat rules.
const ensureAutomaticScheduleForContent = async (content) => {
  const [connectedFacebook, connectedInstagram] = await Promise.all([
    SocialAccount.exists({ platform: "facebook", status: "connected" }),
    SocialAccount.exists({ platform: "instagram", status: "connected" }),
  ]);
  if (!connectedFacebook || !connectedInstagram) {
    return { skipped: true, reason: "Connect both Facebook and Instagram to start automatic scheduling." };
  }

  const productCount = await Product.countDocuments({ isActive: { $ne: false }, deletedAt: null });
  const repeatEveryDays = Math.max(MIN_REPEAT_DAYS, Math.ceil(productCount / POSTING_HOURS.length));
  const occupiedSchedules = await Schedule.find({
    $or: [
      { autoManaged: true, status: "scheduled", scheduledAt: { $gt: new Date() } },
      { status: "processing" },
    ],
  }).select("scheduledAt lastRunAt status");
  const occupiedTimes = occupiedSchedules.map((schedule) => new Date(
    schedule.status === "processing" ? schedule.lastRunAt || schedule.scheduledAt : schedule.scheduledAt
  ).getTime()).filter(Number.isFinite);
  const scheduledAt = findNextFreePostingSlot(Date.now(), occupiedTimes, repeatEveryDays);
  if (!scheduledAt) throw new Error("No available automatic posting slot was found.");

  const schedule = new Schedule({
    content: content._id,
    createdBy: content.createdBy,
    platforms: ["facebook", "instagram"],
    platform: "facebook",
    scheduledAt,
    repeatEnabled: true,
    repeatEvery: repeatEveryDays,
    repeatUnit: "days",
    generateNewContent: false,
    autoDeletePrevious: true,
    autoManaged: true,
    status: "scheduled",
    errorMessage: "",
  });
  await schedule.save();
  content.status = "scheduled";
  await content.save();
  return { created: 1, scheduleId: schedule._id, scheduledAt, repeatEveryDays };
};

module.exports = { ensureAutomaticSchedules, ensureAutomaticScheduleForContent };
