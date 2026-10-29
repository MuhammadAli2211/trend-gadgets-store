"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../../lib/api";

export default function SchedulesPage() {
const router = useRouter();

const [schedules, setSchedules] = useState([]);
const [loading, setLoading] = useState(true);
const [refreshing, setRefreshing] = useState(false);
const [deletingId, setDeletingId] = useState("");
const [retryingInstagramId, setRetryingInstagramId] = useState("");
const [error, setError] = useState("");

const loadSchedules = async (showLoader = true) => {
try {


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
const timeoutId = setTimeout(() => loadSchedules(), 0);
return () => clearTimeout(timeoutId);
}, []);

// ====================================================
// CANCEL
// ====================================================

const cancelSchedule = async (id) => {
const confirmed = window.confirm(
"Cancel this schedule?\n\nThe schedule will stop running automatically."
);


if (!confirmed) return;

try {
  const response = await api.put(
    `/schedules/${id}/cancel`
  );

  if (response.data?.success) {
    await loadSchedules(false);
  } else {
    alert(
      response.data?.message ||
        "Unable to cancel schedule."
    );
  }
} catch (error) {
  console.error(
    "Cancel schedule error:",
    error
  );

  alert(
    error.response?.data?.message ||
      "Unable to cancel schedule."
  );
}


};

const retryInstagramForSchedule = async (schedule) => {
  const facebookPermalink = window.prompt(
    "Facebook wali live Reel ka link check karein:",
    "https://www.facebook.com/reel/1668233174885888"
  );
  if (!facebookPermalink) return;

  try {
    setRetryingInstagramId(schedule._id);
    const response = await api.post(
      `/schedules/${schedule._id}/retry-instagram`,
      { facebookPermalink }
    );
    if (response.data?.success) {
      await loadSchedules(false);
      window.alert("Facebook post safe mark ho gayi. Ab sirf Instagram retry hoga.");
    } else {
      window.alert(response.data?.message || "Instagram retry queue nahi ho saki.");
    }
  } catch (retryError) {
    window.alert(retryError.response?.data?.message || "Instagram retry queue nahi ho saki.");
  } finally {
    setRetryingInstagramId("");
  }
};

// ====================================================
// DELETE SCHEDULE
// ====================================================

const deleteSchedule = async (id) => {
const confirmed = window.confirm(
"Delete this schedule?\n\nIf it was published on Facebook or Instagram, that social-media post will also be deleted."
);


if (!confirmed) return;

try {
  setDeletingId(id);

  const response = await api.delete(
    `/schedules/${id}`
  );

  if (response.data?.success) {
    setSchedules((current) =>
      current.filter(
        (item) => item._id !== id
      )
    );
  } else {
    alert(
      response.data?.message ||
        "Unable to delete schedule."
    );
  }
} catch (error) {
  console.error(
    "Delete schedule error:",
    error
  );

  alert(
    error.response?.data?.message ||
      "Unable to delete schedule."
  );
} finally {
  setDeletingId("");
}


};

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

const publishedCount =
schedules.filter(
(item) =>
item.status === "published"
).length;

const manualShareCount = schedules.filter(
  (item) => item.status === "manual_required"
).length;

const failedCount =
schedules.filter(
(item) =>
item.status === "failed"
).length;

const cancelledCount =
schedules.filter(
(item) =>
item.status === "cancelled"
).length;

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
            Content Scheduling
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manually control when your
            content should be published.
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

          <button
            onClick={() =>
              router.push(
                "/admin-dashboard/schedules/add"
              )
            }
            className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800"
          >
            + Create Schedule
          </button>
        </div>
      </div>
    </div>
  </header>

  {/* SUMMARY */}

  <section className="mx-auto max-w-7xl px-6 pt-6">
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Scheduled
        </p>

        <p className="mt-1 text-2xl font-bold text-blue-600">
          {scheduledCount}
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Published
        </p>

        <p className="mt-1 text-2xl font-bold text-green-600">
          {publishedCount}
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Manual Status share
        </p>

        <p className="mt-1 text-2xl font-bold text-amber-700">
          {manualShareCount}
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Failed
        </p>

        <p className="mt-1 text-2xl font-bold text-red-600">
          {failedCount}
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Cancelled
        </p>

        <p className="mt-1 text-2xl font-bold text-gray-600">
          {cancelledCount}
        </p>
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
            Approve some content and
            create your first schedule.
          </p>

          <button
            onClick={() =>
              router.push(
                "/admin-dashboard/schedules/add"
              )
            }
            className="mt-5 rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            + Create Schedule
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px]">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                  Content
                </th>

                <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                  Product
                </th>

                <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                  Platforms
                </th>

                <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                  Schedule
                </th>

                <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                  Next Run
                </th>

                <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                  Runs
                </th>

                <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                  Status
                </th>

                <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                  Published
                </th>

                <th className="px-5 py-4 text-left text-sm font-semibold text-gray-700">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {schedules.map(
                (schedule) => {
                  const mediaUrl =
                    getMediaUrl(
                      schedule
                    );

                  const platforms =
                    getPlatforms(
                      schedule
                    );

                  const publishedPosts =
                    getPublishedPosts(
                      schedule
                    );
                  const stuckSince = new Date(
                    schedule.currentRunStartedAt || schedule.lastRunAt || 0
                  ).getTime();
                  const canRecoverInstagram =
                    ["processing", "failed"].includes(schedule.status) &&
                    Number(schedule.runCount || 0) >= 3 &&
                    stuckSince > 0 && Date.now() - stuckSince >= 6 * 60 * 1000 &&
                    platforms.includes("facebook") && platforms.includes("instagram") &&
                    String(schedule.content?.product?.name || "").toLowerCase().includes("super smooth 3 blade spin cutter");

                  return (
                    <tr
                      key={
                        schedule._id
                      }
                      className="border-b align-top last:border-b-0 hover:bg-gray-50"
                    >
                      {/* CONTENT */}

                      <td className="px-5 py-5">
                        <div className="flex items-start gap-3">
                          {mediaUrl ? (
                            isVideo(
                              schedule
                            ) ? (
                              <video
                                src={
                                  mediaUrl
                                }
                                className="h-16 w-24 rounded-lg bg-black object-cover"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : (
                              <img
                                src={
                                  mediaUrl
                                }
                                alt="Content"
                                className="h-16 w-24 rounded-lg bg-gray-100 object-cover"
                              />
                            )
                          ) : (
                            <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-medium text-gray-400">
                              No Media
                            </div>
                          )}

                          <div className="max-w-sm">
                            <p className="line-clamp-3 text-sm leading-5 text-gray-700">
                              {getContentCaption(
                                schedule
                              )}
                            </p>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {schedule.generateNewContent && (
                                <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
                                  Fresh content
                                </span>
                              )}

                              {schedule.autoDeletePrevious && (
                                <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
                                  Auto-delete
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* PRODUCT */}

                      <td className="px-5 py-5">
                        <p className="text-sm font-semibold text-gray-800">
                          {getProductName(
                            schedule
                          )}
                        </p>

                        {schedule
                          ?.content
                          ?.product
                          ?.price !==
                          undefined && (
                          <p className="mt-1 text-xs text-gray-500">
                            Rs.{" "}
                            {
                              schedule
                                .content
                                .product
                                .price
                            }
                          </p>
                        )}
                      </td>

                      {/* PLATFORMS */}

                      <td className="px-5 py-5">
                        {platforms.length >
                        0 ? (
                          <div className="flex max-w-[190px] flex-wrap gap-2">
                            {platforms.map(
                              (
                                platform
                              ) => {
                                const published =
                                  publishedPosts.find(
                                    (
                                      item
                                    ) =>
                                      item?.platform ===
                                      platform
                                  );

                                return (
                                  <div
                                    key={
                                      platform
                                    }
                                    className="flex flex-col gap-1"
                                  >
                                    <span
                                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getPlatformClass(
                                        platform
                                      )}`}
                                    >
                                      {getPlatformLabel(
                                        platform
                                      )}
                                    </span>

                                    {published?.success && (
                                      <span className="text-[10px] font-medium text-green-600">
                                        ✓ Published
                                      </span>
                                    )}

                                    {published?.manualRequired && (
                                      <span className="text-[10px] font-medium text-amber-700">
                                        Ready for manual Status share
                                      </span>
                                    )}

                                    {published &&
                                      !published.success && !published.manualRequired && (
                                        <span className="text-[10px] font-medium text-red-600">
                                          ✕ Failed
                                        </span>
                                      )}
                                  </div>
                                );
                              }
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">
                            No platform
                          </span>
                        )}
                      </td>

                      {/* SCHEDULE */}

                      <td className="px-5 py-5">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            schedule.repeatEnabled
                              ? "bg-purple-100 text-purple-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {getRepeatText(
                            schedule
                          )}
                        </span>

                        <div className="mt-3 space-y-1">
                          {schedule.generateNewContent && (
                            <p className="text-xs text-purple-600">
                              ✓ Generate fresh
                              Reel
                            </p>
                          )}

                          {schedule.autoDeletePrevious ? (
                            <p className="text-xs text-orange-600">
                              ✓ Delete
                              previous
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400">
                              Previous post
                              kept
                            </p>
                          )}
                        </div>
                      </td>

                      {/* NEXT RUN */}

                      <td className="px-5 py-5">
                        <p className="text-sm font-medium text-gray-800">
                          {formatDate(
                            schedule.scheduledAt
                          )}
                        </p>

                        {schedule.lastRunAt && (
                          <p className="mt-1 text-xs text-gray-500">
                            Last:{" "}
                            {formatDate(
                              schedule.lastRunAt
                            )}
                          </p>
                        )}
                      </td>

                      {/* RUNS */}

                      <td className="px-5 py-5">
                        <span className="text-lg font-bold text-gray-800">
                          {schedule.runCount ||
                            0}
                        </span>

                        {schedule.repeatEnabled && (
                          <p className="mt-1 text-xs text-gray-500">
                            Repeating
                          </p>
                        )}
                      </td>

                      {/* STATUS */}

                      <td className="px-5 py-5">
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                            schedule.status
                          )}`}
                        >
                          {getStatusLabel(
                            schedule.status
                          )}
                        </span>

                        {schedule.errorMessage && (
                          <div className={`mt-2 max-w-[250px] rounded-lg p-2 ${schedule.status === "manual_required" ? "bg-amber-50" : "bg-red-50"}`}>
                            <p className={`text-xs leading-4 ${schedule.status === "manual_required" ? "text-amber-800" : "text-red-600"}`}>
                              {
                                schedule.errorMessage
                              }
                            </p>
                          </div>
                        )}
                        {canRecoverInstagram && (
                          <button
                            type="button"
                            onClick={() => retryInstagramForSchedule(schedule)}
                            disabled={retryingInstagramId === schedule._id}
                            className="mt-3 rounded-lg bg-pink-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {retryingInstagramId === schedule._id ? "Queueing…" : "Retry Instagram only"}
                          </button>
                        )}
                      </td>

                      {/* PUBLISHED */}

                      <td className="px-5 py-5">
                        {publishedPosts.length >
                        0 ? (
                          <div className="space-y-2">
                            {publishedPosts.map(
                              (
                                post,
                                index
                              ) => {
                                const deleteStatus =
                                  getDeleteStatus(
                                    post
                                  );

                                return (
                                  <div
                                    key={`${post.platform}-${post.postId || index}`}
                                    className="rounded-lg border bg-gray-50 p-2"
                                  >
                                    <p className="text-xs font-semibold capitalize text-gray-700">
                                      {
                                        post.platform
                                      }
                                    </p>

                                    {post.manualRequired ? (
                                      <>
                                        <p className="mt-1 text-[11px] font-medium text-amber-700">Ready to share to WhatsApp Status</p>
                                        {mediaUrl && <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[11px] font-medium text-emerald-700 hover:underline">Open media to share</a>}
                                        <button type="button" onClick={() => markWhatsAppStatusShared(schedule._id)} disabled={markingShareId === schedule._id} className="mt-2 rounded-md border border-emerald-300 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-800 disabled:opacity-50">{markingShareId === schedule._id ? "Saving…" : "Mark as shared after posting"}</button>
                                      </>
                                    ) : post.success ? (
                                      <>
                                        {post.platform === "whatsapp" ? (
                                          <>
                                            <p className="mt-1 text-[11px] text-green-600">✓ Shared manually to WhatsApp Status</p>
                                            {mediaUrl && <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[11px] font-medium text-emerald-700 hover:underline">Open status media</a>}
                                          </>
                                        ) : (
                                          <p className="mt-1 text-[11px] text-green-600">✓ Published</p>
                                        )}

                                        {deleteStatus && (
                                          <p
                                            className={`text-[11px] ${
                                              deleteStatus.type ===
                                              "deleted"
                                                ? "text-green-600"
                                                : deleteStatus.type ===
                                                  "unavailable"
                                                ? "text-yellow-600"
                                                : "text-red-600"
                                            }`}
                                          >
                                            {
                                              deleteStatus.text
                                            }
                                          </p>
                                        )}

                                        {post.postId && (
                                          <a
                                            href={getViewPostUrl(
                                              post
                                            )}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-1 block text-[11px] font-medium text-blue-600 hover:underline"
                                          >
                                            View
                                            post
                                          </a>
                                        )}

                                        {post.deleteMessage && (
                                          <p className="mt-1 text-[10px] leading-4 text-gray-500">
                                            {
                                              post.deleteMessage
                                            }
                                          </p>
                                        )}
                                      </>
                                    ) : (
                                      <p className="mt-1 text-[11px] text-red-600">
                                        ✕ Failed
                                      </p>
                                    )}
                                  </div>
                                );
                              }
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            Not published yet
                          </span>
                        )}
                      </td>

                      {/* ACTION */}

                      <td className="px-5 py-5">
                        <div className="flex min-w-[135px] flex-col gap-2">
                          {schedule.status ===
                            "scheduled" ||
                          schedule.status ===
                            "failed" ? (
                            <button
                              onClick={() =>
                                router.push(
                                  `/admin-dashboard/schedules/edit/${schedule._id}`
                                )
                              }
                              className="rounded-md border bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>
                          ) : null}

                          {schedule.status ===
                            "scheduled" && (
                            <button
                              onClick={() =>
                                cancelSchedule(
                                  schedule._id
                                )
                              }
                              className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                            >
                              Cancel
                            </button>
                          )}

                          {schedule.status ===
                            "processing" && (
                            <span className="rounded-md bg-yellow-50 px-3 py-2 text-center text-xs font-semibold text-yellow-700">
                              Processing...
                            </span>
                          )}

                          {schedule.status === "manual_required" && (
                            <span className="rounded-md bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800">Manual Status share required</span>
                          )}

                          {schedule.status ===
                            "published" && (
                            <span className="rounded-md bg-green-50 px-3 py-2 text-center text-xs font-semibold text-green-700">
                              Published
                            </span>
                          )}

                          {schedule.status ===
                            "cancelled" && (
                            <span className="rounded-md bg-gray-100 px-3 py-2 text-center text-xs font-semibold text-gray-500">
                              Cancelled
                            </span>
                          )}

                          {schedule.status !== "processing" && (
                            <button
                              onClick={() => deleteSchedule(schedule._id)}
                              disabled={deletingId === schedule._id}
                              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingId === schedule._id ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </section>
</main>


);
}
