const Product = require("../models/Product");
const Content = require("../models/Content");
const Schedule = require("../models/Schedule");
const SocialAccount = require("../models/SocialAccount");
const { getProductVideoAsset } = require("../utils/productVideo");
const mongoose = require("mongoose");

const PAKISTAN_OFFSET_MS = 5 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Queue posts between 8:00 AM and 7:00 PM Pakistan time, one per hour.
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

const findNextFreePostingSlot = (notBefore, occupiedTimes) => {
  const minimum = Math.max(Date.now(), new Date(notBefore || Date.now()).getTime());
  const pakistanDate = toPakistanParts(new Date(minimum));
  const firstDayUtc = Date.UTC(pakistanDate.year, pakistanDate.month, pakistanDate.day);

  for (let day = 0; day < 366; day += 1) {
    for (const hour of POSTING_HOURS) {
      const candidate = firstDayUtc + day * DAY_MS + hour * HOUR_MS - PAKISTAN_OFFSET_MS;
      if (candidate < minimum) continue;
      if (occupiedTimes.some((time) => Math.abs(time - candidate) < HOUR_MS)) continue;
      return new Date(candidate);
    }
  }

  return null;
};

const clearHistoricalAutomaticPublishRecords = async () => {
  const migrations = mongoose.connection.collection("system_migrations");
  const previousMigration = await migrations.findOne({
    _id: "clear-automatic-publish-history-2026-11-04",
  });
  const migrationId = "clear-automatic-publish-history-2026-11-04-v2";
  let migration = await migrations.findOne({ _id: migrationId });
  if (migration?.completedAt) return { alreadyCompleted: true, schedules: 0, contents: 0 };

  const cutoff = migration?.cutoffAt || previousMigration?.cutoffAt || new Date();
  if (!migration) {
    try {
      await migrations.insertOne({ _id: migrationId, cutoffAt: cutoff, startedAt: new Date() });
    } catch (error) {
      if (error.code !== 11000) throw error;
      migration = await migrations.findOne({ _id: migrationId });
    }
  }

  let schedulesCleared = 0;
  const schedules = await Schedule.find({ autoManaged: true, status: { $ne: "processing" } });
  for (const schedule of schedules) {
    const previousPosts = (schedule.publishedPosts || []).map((post) => post.toObject?.() || post);
    const keptPosts = previousPosts.filter((post) =>
      !post.success || (post.publishedAt && new Date(post.publishedAt) > cutoff)
    );
    const previousSuccessfulPostIds = new Set(previousPosts
      .filter((post) => post.success && (!post.publishedAt || new Date(post.publishedAt) <= cutoff))
      .map((post) => post.postId)
      .filter(Boolean));
    const latestSuccessfulPost = keptPosts
      .filter((post) => post.success)
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))[0];
    const facebookPost = keptPosts
      .filter((post) => post.success && post.platform === "facebook")
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))[0];
    const pendingPostDeletions = (schedule.pendingPostDeletions || []).filter((item) =>
      item.queuedAt && new Date(item.queuedAt) > cutoff
    );
    const historyWasCleared = previousSuccessfulPostIds.size > 0 ||
      Boolean(schedule.publishedPostId) ||
      Boolean(schedule.previousPublishedPostId) ||
      (schedule.publishedAt && new Date(schedule.publishedAt) <= cutoff) ||
      (schedule.pendingPostDeletions || []).length !== pendingPostDeletions.length ||
      schedule.status === "published";
    if (!historyWasCleared) continue;

    schedule.publishedPosts = keptPosts;
    schedule.publishedAt = latestSuccessfulPost?.publishedAt || null;
    schedule.publishedPostId = facebookPost?.postId || "";
    schedule.publishedUrl = facebookPost?.publishedUrl || "";
    schedule.previousPublishedPostId = facebookPost?.postId || "";
    schedule.pendingPostDeletions = pendingPostDeletions;

    // A completed one-time schedule needs a fresh queue entry after its old
    // social posts and success history have been cleared.
    if (schedule.status === "published" && !latestSuccessfulPost) {
      schedule.status = "cancelled";
      schedule.autoManaged = false;
    }
    if (!(schedule.publishedPosts || []).some((post) => !post.success && post.error)) {
      schedule.lastRunAt = null;
      schedule.currentRunStartedAt = null;
      schedule.runCount = 0;
      if (schedule.status !== "cancelled") schedule.errorMessage = "";
    }
    await schedule.save();
    schedulesCleared += 1;
  }

  let contentsCleared = 0;
  const contents = await Content.find({
    generatedAutomatically: true,
    createdAt: { $lte: cutoff },
  });
  for (const content of contents) {
    const previousPosts = content.publishedPosts || [];
    const keptPosts = previousPosts.filter((post) =>
      post.publishedAt && new Date(post.publishedAt) > cutoff
    );
    const hasOldScalarHistory = Boolean(
      content.publishedPostId || content.publishedUrl ||
      (content.publishedAt && new Date(content.publishedAt) <= cutoff) ||
      content.status === "published"
    );
    if (!previousPosts.length && !hasOldScalarHistory) continue;

    content.publishedPosts = keptPosts;
    const latestPost = [...keptPosts].sort((a, b) =>
      new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
    )[0];
    content.publishedAt = latestPost?.publishedAt || null;
    content.publishedPostId = latestPost?.postId || "";
    content.publishedUrl = latestPost?.publishedUrl || "";
    if (content.status === "published" && !latestPost) content.status = "approved";
    await content.save();
    contentsCleared += 1;
  }

  await migrations.updateOne(
    { _id: migrationId },
    { $set: { cutoffAt: cutoff, completedAt: new Date(), schedulesCleared, contentsCleared } }
  );
  return { alreadyCompleted: false, schedules: schedulesCleared, contents: contentsCleared };
};

const ensureAutomaticSchedules = async () => {
  const connectedFacebook = await SocialAccount.exists({ platform: "facebook", status: "connected" });
  const connectedInstagram = await SocialAccount.exists({ platform: "instagram", status: "connected" });
  if (!connectedFacebook || !connectedInstagram) {
    return { skipped: true, reason: "Connect both Facebook and Instagram to start automatic posting." };
  }

  const products = await Product.find({ isActive: { $ne: false }, deletedAt: null })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id createdAt images video videos");
  if (!products.length) return { created: 0, updated: 0, cancelledDuplicates: 0 };
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
    const productImages = (product.images || []).filter((image) => image?.url).slice(0, 10);
    const productImage = productImages[0];
    const media = productVideo?.url
      ? { url: productVideo.url, publicId: productVideo.publicId || "", resourceType: "video", images: [] }
      : productImage
        ? { url: productImage.url, publicId: productImage.publicId || "", resourceType: "image", images: productImages }
        : null;
    if (!media) continue;

    const type = media.resourceType === "video" ? "reel" : "post";
    const audioMode = media.resourceType === "video" ? "original" : "none";
    const mediaChanged =
      content.type !== type ||
      content.media?.url !== media.url ||
      content.media?.publicId !== media.publicId ||
      content.media?.resourceType !== media.resourceType ||
      JSON.stringify(content.media?.images || []) !== JSON.stringify(media.images || []);
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
  }).select("scheduledAt lastRunAt status repeatEnabled autoDeletePrevious generateNewContent");
  const occupiedTimes = fixedSchedules.filter((schedule) =>
    schedule.status === "processing" ||
    (!schedule.repeatEnabled && !schedule.autoDeletePrevious && !schedule.generateNewContent)
  ).map((schedule) => new Date(
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
    const failed = productSchedules.find((schedule) => schedule.status === "failed");
    const legacyPublished = productSchedules.find((schedule) =>
      schedule.status === "published" && schedule.autoManaged && schedule.repeatEnabled
    );
    const completedOneTimePost = productSchedules.some((schedule) =>
      schedule.status === "published" && schedule.autoManaged && !schedule.repeatEnabled
    );
    if (!scheduled && !failed && !legacyPublished && completedOneTimePost) return null;

    const reusableSchedule = scheduled || failed || legacyPublished;
    const scheduledContentId = reusableSchedule ? String(reusableSchedule.content) : "";
    const content = eligibleContents.find((item) => String(item._id) === scheduledContentId) || eligibleContents[0];
    if (!content) return null;

    const hasStoredPlatformFailure = (reusableSchedule?.publishedPosts || [])
      .some((post) => !post.success && !post.manualRequired);

    const oldTime = reusableSchedule?.scheduledAt ? new Date(reusableSchedule.scheduledAt).getTime() : 0;
    const needsFreshQueue = Boolean(reusableSchedule && (
      reusableSchedule.repeatEnabled ||
      reusableSchedule.autoDeletePrevious ||
      reusableSchedule.generateNewContent
    ));
    const preserveRetry = Boolean(
      (reusableSchedule?.retryOnlyFailed || hasStoredPlatformFailure) &&
      reusableSchedule.status === "scheduled" &&
      !needsFreshQueue
    );
    const notBefore = preserveRetry
      ? Math.max(Date.now(), oldTime)
      : !needsFreshQueue && scheduled && oldTime > Date.now()
        ? oldTime
        : Date.now();
    return { productId, content, schedules: productSchedules, reusableSchedule, notBefore, queueOrder: oldTime };
  }).filter(Boolean);

  plans.sort((a, b) => a.notBefore - b.notBefore || a.queueOrder - b.queueOrder || a.productId.localeCompare(b.productId));

  for (const plan of plans) {
    const current = plan.reusableSchedule;
    let scheduledAt;
    const currentScheduledAt = current?.scheduledAt ? new Date(current.scheduledAt) : null;
    const currentScheduledAtMs = currentScheduledAt?.getTime() || 0;
    const currentSlotIsDue = currentScheduledAtMs <= Date.now() && plan.notBefore <= Date.now();
    const preserveRetry = Boolean(
      (current?.retryOnlyFailed || (current?.publishedPosts || []).some((post) => !post.success && !post.manualRequired)) &&
      current.status === "scheduled" &&
      !current.repeatEnabled &&
      !current.autoDeletePrevious &&
      !current.generateNewContent
    );

    if (preserveRetry) {
      scheduledAt = currentScheduledAt;
      occupiedTimes.push(scheduledAt.getTime());
    } else if (
      current?.autoManaged &&
      current.status === "scheduled" &&
      !current.repeatEnabled &&
      !current.autoDeletePrevious &&
      !current.generateNewContent &&
      isPostingHour(currentScheduledAt) &&
      (currentScheduledAtMs >= plan.notBefore || currentSlotIsDue)
    ) {
      // Keep an eligible overdue slot due so the worker can publish it below.
      // Moving it to the next future slot here made successful cron runs skip posts.
      scheduledAt = currentScheduledAt;
      occupiedTimes.push(scheduledAt.getTime());
    } else {
      scheduledAt = findNextFreePostingSlot(plan.notBefore, occupiedTimes);
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
    target.repeatEnabled = false;
    target.repeatEvery = 1;
    target.repeatUnit = "days";
    target.generateNewContent = false;
    target.autoDeletePrevious = false;
    target.autoManaged = true;
    target.status = "scheduled";
    target.retryOnlyFailed = preserveRetry;
    if (preserveRetry && !target.errorMessage) {
      const failureDetails = (target.publishedPosts || [])
        .filter((post) => !post.success && !post.manualRequired)
        .map((post) => `${post.platform}: ${post.error || "previous publishing attempt failed"}`)
        .join(" | ");
      target.errorMessage = failureDetails || "A previous platform attempt failed; the failed platform will retry at the scheduled time.";
    }
    if (!preserveRetry) {
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
      notBefore: Math.max(Date.now(), lastPublishedAt ? lastPublishedAt + HOUR_MS : 0),
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
      : findNextFreePostingSlot(notBefore, normalizedTimes);

    if (!nextTime) {
      deferred += 1;
      continue;
    }

    const policyNeedsUpdate =
      schedule.repeatEnabled !== false ||
      Number(schedule.repeatEvery) !== 1 ||
      schedule.repeatUnit !== "days" ||
      schedule.generateNewContent !== false ||
      schedule.autoDeletePrevious !== false ||
      JSON.stringify([...(schedule.platforms || [])].sort()) !== JSON.stringify(["facebook", "instagram"]) ||
      schedule.retryOnlyFailed === true ||
      Number(schedule.retryCount || 0) !== 0 ||
      Boolean(schedule.retryForScheduledAt) ||
      Boolean(schedule.errorMessage);

    if (nextTime.getTime() !== currentTime || policyNeedsUpdate) {
      schedule.scheduledAt = nextTime;
      schedule.repeatEnabled = false;
      schedule.repeatEvery = 1;
      schedule.repeatUnit = "days";
      schedule.generateNewContent = false;
      schedule.autoDeletePrevious = false;
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

// Add a newly-created product to the end of the one-time hourly queue.
const ensureAutomaticScheduleForContent = async (content) => {
  const [connectedFacebook, connectedInstagram] = await Promise.all([
    SocialAccount.exists({ platform: "facebook", status: "connected" }),
    SocialAccount.exists({ platform: "instagram", status: "connected" }),
  ]);
  if (!connectedFacebook || !connectedInstagram) {
    return { skipped: true, reason: "Connect both Facebook and Instagram to start automatic posting." };
  }

  const occupiedSchedules = await Schedule.find({
    $or: [
      { autoManaged: true, status: "scheduled", scheduledAt: { $gt: new Date() } },
      { status: "processing" },
    ],
  }).select("scheduledAt lastRunAt status");
  const occupiedTimes = occupiedSchedules.map((schedule) => new Date(
    schedule.status === "processing" ? schedule.lastRunAt || schedule.scheduledAt : schedule.scheduledAt
  ).getTime()).filter(Number.isFinite);
  const scheduledAt = findNextFreePostingSlot(Date.now(), occupiedTimes);
  if (!scheduledAt) throw new Error("No available automatic posting slot was found.");

  const schedule = new Schedule({
    content: content._id,
    createdBy: content.createdBy,
    platforms: ["facebook", "instagram"],
    platform: "facebook",
    scheduledAt,
    repeatEnabled: false,
    repeatEvery: 1,
    repeatUnit: "days",
    generateNewContent: false,
    autoDeletePrevious: false,
    autoManaged: true,
    status: "scheduled",
    errorMessage: "",
  });
  await schedule.save();
  content.status = "scheduled";
  await content.save();
  return { created: 1, scheduleId: schedule._id, scheduledAt };
};

// One-time safe queue reset: preserve published post IDs/history, but rebuild
// automatic product schedules into fresh future hourly slots. Manual schedules
// and any currently-processing record are left untouched.
const resetAutomaticQueueOnce = async () => {
  const migrations = mongoose.connection.collection("system_migrations");
  const migrationId = "rebuild-automatic-queue-2026-11-07-v1";
  const existing = await migrations.findOne({ _id: migrationId });
  if (existing?.completedAt) return { alreadyCompleted: true, cancelled: 0 };

  const schedules = await Schedule.find({
    autoManaged: true,
    status: { $ne: "processing" },
  });
  let cancelled = 0;
  for (const schedule of schedules) {
    schedule.status = "cancelled";
    schedule.autoManaged = false;
    schedule.errorMessage = "Replaced during the one-time automatic queue rebuild. Previous publishing history was preserved.";
    schedule.retryOnlyFailed = false;
    schedule.retryCount = 0;
    schedule.retryForScheduledAt = null;
    await schedule.save();
    cancelled += 1;
  }

  await migrations.updateOne(
    { _id: migrationId },
    { $set: { startedAt: existing?.startedAt || new Date(), completedAt: new Date(), cancelled } },
    { upsert: true }
  );
  return { alreadyCompleted: false, cancelled };
};

module.exports = {
  clearHistoricalAutomaticPublishRecords,
  resetAutomaticQueueOnce,
  ensureAutomaticSchedules,
  ensureAutomaticScheduleForContent,
  findNextFreePostingSlot,
};
