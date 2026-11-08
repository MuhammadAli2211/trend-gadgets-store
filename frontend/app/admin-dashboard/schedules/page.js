"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import api from "../../../lib/api";

export default function SchedulesPage() {
const [schedules, setSchedules] = useState([]);
const [loading, setLoading] = useState(true);
const [refreshing, setRefreshing] = useState(false);
const [error, setError] = useState("");
const [scheduleSearch, setScheduleSearch] = useState("");
const [statusFilter, setStatusFilter] = useState("all");
const [currentTime, setCurrentTime] = useState(null);

const loadSchedules = async (showLoader = true) => {
try {
setCurrentTime(Date.now());


  const response = await api.get("/schedules");
  setError("");

  if (response.data?.success) {
    setSchedules(response.data.schedules || []);
  } else {
    setSchedules([]);
  }
} catch (error) {
  console.error("Load schedules error:", error);

  setError(
    error.response?.data?.message ||
      "Unable to load schedules."
  );
} finally {
  setLoading(false);
  setRefreshing(false);
}


};

useEffect(() => {
const timeoutId = setTimeout(() => {
  setCurrentTime(Date.now());
  loadSchedules();
}, 0);
return () => clearTimeout(timeoutId);
}, []);

// ====================================================
// DATE
// ====================================================

const formatDate = (date) => {
if (!date) return "-";


const parsedDate = new Date(date);

if (
  Number.isNaN(
    parsedDate.getTime()
  )
) {
  return "-";
}

return parsedDate.toLocaleString(
  "en-PK",
  {
    dateStyle: "medium",
    timeStyle: "short",
  }
);


};

const getNextPostLabel = (schedule) => {
  if (schedule?.status === "processing") return "Sending now";
  const scheduledAt = new Date(schedule?.scheduledAt).getTime();
  if (currentTime && Number.isFinite(scheduledAt) && scheduledAt < currentTime) {
    return `Due · ${formatDate(schedule.scheduledAt)}`;
  }
  return formatDate(schedule?.scheduledAt);
};

// ====================================================
// STATUS
// ====================================================

const getStatusClass = (status) => {
switch (status) {
case "scheduled":
return "bg-blue-100 text-blue-700";


  case "processing":
    return "bg-yellow-100 text-yellow-700";

  case "published":
    return "bg-green-100 text-green-700";

  case "manual_required":
    return "bg-amber-100 text-amber-800";

  case "failed":
    return "bg-red-100 text-red-700";

  case "cancelled":
    return "bg-gray-100 text-gray-600";

  default:
    return "bg-gray-100 text-gray-700";
}


};

const getStatusLabel = (status) => {
if (!status) return "Unknown";


return String(status)
  .replace(/_/g, " ")
  .replace(/\b\w/g, (char) =>
    char.toUpperCase()
  );


};

// ====================================================
// REPEAT
// ====================================================

const getRepeatText = (schedule) => {
if (!schedule?.repeatEnabled) {
return "One time";
}


const every = Number(
  schedule.repeatEvery || 1
);

if (every === 1) {
  return "Every 1 day";
}

return `Every ${every} days`;


};

// ====================================================
// PLATFORMS
// ====================================================

const getPlatforms = (schedule) => {
if (
Array.isArray(schedule?.platforms) &&
schedule.platforms.length > 0
) {
return [
...new Set(
schedule.platforms.filter(Boolean)
),
];
}


if (schedule?.platform) {
  return [schedule.platform];
}

return [];


};

const getPlatformClass = (platform) => {
if (platform === "facebook") {
return "bg-blue-100 text-blue-700";
}


if (platform === "instagram") {
  return "bg-pink-100 text-pink-700";
}

if (platform === "tiktok") {
  return "bg-gray-900 text-white";
}

return "bg-gray-100 text-gray-700";


};

const getPlatformLabel = (platform) => {
if (platform === "facebook") {
return "Facebook";
}


if (platform === "instagram") {
  return "Instagram";
}

if (platform === "tiktok") {
  return "TikTok";
}

return platform || "Unknown";


};

// ====================================================
// CONTENT
// ====================================================

const getProductName = (schedule) => {
return (
schedule?.content?.product?.name ||
schedule?.product?.name ||
"Unknown product"
);
};

const getContentCaption = (schedule) => {
return (
schedule?.content?.caption ||
schedule?.caption ||
"No caption"
);
};

const getMediaUrl = (schedule) => {
return (
schedule?.content?.media?.url ||
schedule?.media?.url ||
""
);
};

const isVideo = (schedule) => {
const resourceType =
schedule?.content?.media
?.resourceType ||
schedule?.media?.resourceType;


const format =
  schedule?.content?.media?.format ||
  schedule?.media?.format;

const url = getMediaUrl(schedule);

return (
  resourceType === "video" ||
  format === "mp4" ||
  url.includes(".mp4") ||
  url.includes("/video/")
);


};

// ====================================================
// PUBLISHED POSTS
// ====================================================

const getPublishedPosts = (schedule) => {
if (
!Array.isArray(
schedule?.publishedPosts
)
) {
return [];
}


return schedule.publishedPosts.filter((post) => post.platform !== "whatsapp");


};

// ====================================================
// VIEW POST URL
// ====================================================

const getViewPostUrl = (post) => {
if (!post?.postId) {
return post?.publishedUrl || "";
}


// Instagram
if (post.platform === "instagram") {
  if (post.publishedUrl) {
    return post.publishedUrl;
  }

  return `https://www.instagram.com/reel/${post.postId}/`;
}

// Facebook
if (post.platform === "facebook") {
  return `https://www.facebook.com/reel/${post.postId}`;
}

// TikTok
if (post.platform === "tiktok") {
  return post.publishedUrl || "";
}

return post.publishedUrl || "";


};

// ====================================================
// DELETE STATUS
// ====================================================

const getDeleteStatus = (post) => {
if (!post) return null;


if (post.deletedPreviousPost === true) {
  return {
    type: "deleted",
    text: "✓ Previous deleted",
  };
}

const message = String(
  post.deleteMessage || ""
).toLowerCase();

if (
  message.includes(
    "already deleted"
  ) ||
  message.includes(
    "already unavailable"
  ) ||
  message.includes(
    "previous unavailable"
  )
) {
  return {
    type: "unavailable",
    text: "⚠ Previous unavailable",
  };
}

if (
  message.includes(
    "deletion failed"
  ) ||
  message.includes(
    "delete failed"
  )
) {
  return {
    type: "failed",
    text: "✕ Previous delete failed",
  };
}

return null;


};

// ====================================================
// COUNTS
// ====================================================

const scheduledCount =
schedules.filter(
(item) =>
item.status === "scheduled"
).length;

const publishedCount = schedules.reduce(
  (total, item) => total + getPublishedPosts(item).filter((post) => post.success).length,
  0
);

const hasScheduleIssue = (schedule) => Boolean(
  schedule?.errorMessage ||
  getPublishedPosts(schedule).some((post) => !post.success && !post.manualRequired)
);
const needsAttention = (schedule) =>
  schedule?.status === "failed" ||
  schedule?.status === "manual_required" ||
  (schedule?.status === "scheduled" && hasScheduleIssue(schedule));
const attentionCount = schedules.filter(needsAttention).length;
const processingCount = schedules.filter((item) => item.status === "processing").length;
const nextSchedule = schedules
  .filter((item) => ["scheduled", "processing"].includes(item.status))
  .sort((left, right) => new Date(left.scheduledAt) - new Date(right.scheduledAt))[0];
const filteredSchedules = schedules.filter((item) => {
  const productName = getProductName(item).toLowerCase();
  const caption = getContentCaption(item).toLowerCase();
  const matchesSearch = `${productName} ${caption}`.includes(scheduleSearch.trim().toLowerCase());
  const matchesStatus = statusFilter === "all"
    || (statusFilter === "attention" ? needsAttention(item) : item.status === statusFilter);
  return matchesSearch && matchesStatus;
}).sort((left, right) => new Date(left.scheduledAt || 0) - new Date(right.scheduledAt || 0));

// ====================================================
// UI
// ====================================================

return ( <main className="min-h-screen bg-gray-100">
{/* HEADER */}


  <header className="border-b bg-white">
    <div className="mx-auto max-w-7xl px-6 py-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Posting Schedule
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Facebook and Instagram posts run automatically from 8 AM to 7 PM, with about one hour between products.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Each product posts once. Old posts stay on your social accounts and are not deleted automatically.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              loadSchedules(false)
            }
            disabled={refreshing}
            className="rounded-lg border bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing
              ? "Refreshing..."
              : "↻ Refresh"}
          </button>

        </div>
      </div>
    </div>
  </header>

  {/* SUMMARY */}

  <section className="mx-auto max-w-7xl px-6 pt-6">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Active schedules</p>
        <p className="mt-1 text-2xl font-bold text-blue-600">{scheduledCount}</p>
        <p className="mt-1 text-xs text-gray-500">Products waiting to post</p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Posts confirmed</p>
        <p className="mt-1 text-2xl font-bold text-green-600">{publishedCount}</p>
        <p className="mt-1 text-xs text-gray-500">Facebook or Instagram posts</p>
      </div>

      <div className={`rounded-xl border p-4 shadow-sm ${attentionCount ? "border-amber-200 bg-amber-50" : "bg-white"}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Needs a check</p>
        <p className={`mt-1 text-2xl font-bold ${attentionCount ? "text-amber-700" : "text-gray-700"}`}>{attentionCount}</p>
        <p className="mt-1 text-xs text-gray-500">Failed posts or retrying</p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Next post</p>
        <p className="mt-1 text-base font-bold text-gray-900">{nextSchedule ? getNextPostLabel(nextSchedule) : "No upcoming post"}</p>
        <p className="mt-1 text-xs text-gray-500">{processingCount ? `${processingCount} post currently sending` : "Times shown in your local timezone"}</p>
      </div>
    </div>
  </section>

  {/* ERROR */}

  <section className="mx-auto max-w-7xl px-6 pt-6">
    {error && (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        {error}
      </div>
    )}
  </section>

  {/* TABLE */}

  <section className="mx-auto max-w-7xl px-6 py-6">
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      {loading ? (
        <div className="p-10 text-center text-gray-500">
          Loading schedules...
        </div>
      ) : schedules.length === 0 ? (
        <div className="p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl">
            📅
          </div>

          <p className="mt-4 text-lg font-semibold text-gray-700">
            No schedules yet
          </p>

          <p className="mt-2 text-sm text-gray-500">
            Automatic schedules will appear here when Facebook and Instagram are connected and products have content.
          </p>
        </div>
      ) : (
        <>
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
          <input
            type="search"
            value={scheduleSearch}
            onChange={(event) => setScheduleSearch(event.target.value)}
            placeholder="Find a product or post"
            aria-label="Search schedules"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter schedules by status"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">All schedules</option>
            <option value="scheduled">Scheduled</option>
            <option value="attention">Needs a check</option>
            <option value="processing">Processing</option>
            <option value="published">Published</option>
            <option value="failed">Failed</option>
            <option value="manual_required">Needs manual share</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <p className="text-sm text-gray-500 lg:text-right">
            <span className="font-semibold text-gray-800">{filteredSchedules.length}</span> schedules shown
          </p>
        </div>

        {filteredSchedules.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">No schedules match your search.</div>
        ) : (
          <>
          <div className="grid gap-4 bg-gray-50 p-4 xl:grid-cols-2 2xl:grid-cols-3">
            {filteredSchedules.map((schedule) => {
              const platforms = getPlatforms(schedule);
              const publishedPosts = getPublishedPosts(schedule);
              const mediaUrl = getMediaUrl(schedule);
              const productImage = schedule?.content?.product?.images?.[0]?.url || "";
              const retryingPlatforms = publishedPosts
                .filter((post) => !post.success && !post.manualRequired)
                .map((post) => getPlatformLabel(post.platform));
              const isRetrying = schedule.status === "scheduled" && (retryingPlatforms.length > 0 || Boolean(schedule.errorMessage));
              const platformFailureDetails = publishedPosts
                .filter((post) => !post.success && !post.manualRequired && post.error)
                .map((post) => `${getPlatformLabel(post.platform)}: ${post.error}`)
                .join(" | ");
              const retryInformation = schedule.errorMessage || platformFailureDetails ||
                (isRetrying ? "Retry is queued, but the previous platform error detail was not saved." : "");
              const displayStatus = isRetrying
                ? `Retrying${retryingPlatforms.length ? ` ${retryingPlatforms.join(" + ")}` : ""}`
                : getStatusLabel(schedule.status);
              const displayStatusClass = isRetrying
                ? "bg-amber-100 text-amber-800"
                : getStatusClass(schedule.status);

              return (
                <article key={schedule._id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex gap-4 p-4">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:h-24 sm:w-24">
                      {productImage ? (
                        <Image src={productImage} alt={getProductName(schedule)} width={96} height={96} sizes="96px" className="h-full w-full object-cover" />
                      ) : mediaUrl && isVideo(schedule) ? (
                        <video src={mediaUrl} className="h-full w-full bg-black object-cover" muted playsInline preload="metadata" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-gray-400">No image</div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="line-clamp-2 text-base font-semibold leading-5 text-gray-900">{getProductName(schedule)}</h2>
                          {schedule?.content?.product?.price !== undefined && (
                            <p className="mt-1 text-sm text-gray-500">Rs. {schedule.content.product.price}</p>
                          )}
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${displayStatusClass}`}>{displayStatus}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-5 text-gray-600">{getContentCaption(schedule)}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 border-y bg-gray-50 p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Next post time</p>
                      <p className="mt-1 text-sm font-bold text-gray-900">{getNextPostLabel(schedule)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Repeat</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{getRepeatText(schedule)}</p>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Where it posts</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {platforms.map((platform) => {
                          const result = publishedPosts.find((post) => post.platform === platform);
                          const postUrl = result?.success ? getViewPostUrl(result) : "";
                          return (
                            <div key={platform} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2">
                              <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${getPlatformClass(platform)}`}>{getPlatformLabel(platform)}</span>
                              {result?.success ? (
                                postUrl ? <a href={postUrl} target="_blank" rel="noopener noreferrer" className="truncate text-xs font-semibold text-green-700 hover:underline">Posted · View</a> : <span className="text-xs font-semibold text-green-700">Posted</span>
                              ) : result?.manualRequired ? (
                                <span className="text-right text-xs font-medium text-amber-700">Ready to share</span>
                              ) : result && schedule.status === "scheduled" ? (
                                <span className="text-right text-xs font-semibold text-amber-700">Retrying</span>
                              ) : result ? (
                                <span className="text-right text-xs font-semibold text-red-700">Failed</span>
                              ) : (
                                <span className="text-right text-xs text-gray-500">Waiting to post</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {retryInformation && (
                      <div className={`rounded-lg border p-3 ${schedule.status === "manual_required" ? "border-amber-200 bg-amber-50" : isRetrying ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                        <p className={`text-xs font-semibold ${schedule.status === "manual_required" || isRetrying ? "text-amber-900" : "text-red-800"}`}>{isRetrying ? "Retry information" : "What happened"}</p>
                        <p className={`mt-1 break-words text-xs leading-5 ${schedule.status === "manual_required" || isRetrying ? "text-amber-800" : "text-red-700"}`}>{retryInformation}</p>
                      </div>
                    )}

                    {schedule.status === "manual_required" && publishedPosts.some((post) => post.manualRequired) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {mediaUrl && <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-emerald-700 hover:underline">Open media</a>}
                        <button type="button" onClick={() => markWhatsAppStatusShared(schedule._id)} disabled={markingShareId === schedule._id} className="rounded-md border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50">{markingShareId === schedule._id ? "Saving…" : "Mark as shared"}</button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-gray-500">
                      <span>{schedule.autoManaged ? "Automatic posting" : "Manual schedule"} · {schedule.autoDeletePrevious ? "Old post cleanup on" : "Old post kept"}</span>
                      <span>{schedule.lastRunAt ? `Last attempt ${formatDate(schedule.lastRunAt)}` : `${schedule.runCount || 0} attempts`}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>


          </>
        )}
        </>
      )}
    </div>
  </section>
</main>


);
}
