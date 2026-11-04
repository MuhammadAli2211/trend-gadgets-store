"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import api from "../../../lib/api";

const chooseContentPerProduct = (items) => {
  const selected = new Map();
  const getPriority = (item) => {
    const productVideos = [item?.product?.video, ...(item?.product?.videos || [])]
      .map((asset) => asset?.url)
      .filter(Boolean);
    if (productVideos.includes(item?.media?.url)) return 6;

    const oldPhotoReel = item?.generatedAutomatically &&
      String(item?.media?.publicId || "").startsWith("ecommerce/reels/");
    if (oldPhotoReel) return 0;

    if (item?.media?.resourceType === "video") return 5;
    if (item?.type === "post") return 4;
    if (item?.type === "reel") return 2;
    return 0;
  };

  for (const item of items) {
    const productId = String(item?.product?._id || item?.product || item?._id);
    const current = selected.get(productId);
    const itemPriority = getPriority(item);
    const currentPriority = current ? getPriority(current) : -1;
    const itemDate = new Date(item?.createdAt || 0).getTime();
    const currentDate = new Date(current?.createdAt || 0).getTime();

    if (
      !current ||
      itemPriority > currentPriority ||
      (itemPriority === currentPriority && itemDate > currentDate)
    ) {
      selected.set(productId, item);
    }
  }

  return [...selected.values()].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
};

export default function ContentManagementPage() {
  const router = useRouter();

  const [contents, setContents] = useState([]);
  const [schedules, setSchedules] = useState([]);

  const [activeTab, setActiveTab] = useState("content");

  const [statusFilter, setStatusFilter] = useState("active");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  // =====================================================
  // LOAD EVERYTHING
  // =====================================================

  

  async function loadEverything() {
    try {

      const [contentResponse, scheduleResponse] =
        await Promise.all([
          api.get("/content", { params: { includeArchived: true } }),
          api.get("/schedules"),
        ]);

      if (contentResponse?.data?.success) {
        setContents(
          contentResponse.data.contents ||
            contentResponse.data.content ||
            []
        );
      }

      if (scheduleResponse?.data?.success) {
        setSchedules(
          scheduleResponse.data.schedules || []
        );
      }
    } catch (error) {
      console.error(
        "Content management loading error:",
        error
      );

      setError(
        error?.response?.data?.message ||
          "Unable to load content management data."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => loadEverything(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await loadEverything();
  };

  // =====================================================
  // HELPERS
  // =====================================================

  const formatDate = (date) => {
    if (!date) return "—";

    try {
      return new Date(date).toLocaleString();
    } catch {
      return "—";
    }
  };

  const getProductName = (content) => {
    return (
      content?.product?.name ||
      content?.productName ||
      "Unknown Product"
    );
  };

  const getMediaUrl = (content) => {
    return (
      content?.media?.url ||
      content?.mediaUrl ||
      ""
    );
  };

  const isVideo = (content) => {
    const resourceType =
      content?.media?.resourceType ||
      "";

    const format =
      content?.media?.format ||
      "";

    const url =
      getMediaUrl(content);

    return (
      resourceType === "video" ||
      format === "mp4" ||
      url.includes(".mp4") ||
      url.includes("/video/")
    );
  };

  const getCaption = (content) => {
    return (
      content?.caption ||
      content?.description ||
      "No caption"
    );
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "approved":
        return "bg-blue-100 text-blue-700";

      case "published":
        return "bg-green-100 text-green-700";

      case "scheduled":
        return "bg-purple-100 text-purple-700";

      case "failed":
        return "bg-red-100 text-red-700";

      case "rejected":
        return "bg-orange-100 text-orange-700";

      case "processing":
        return "bg-yellow-100 text-yellow-700";

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

  const getPublishedPosts = (schedule) => {
    if (
      !Array.isArray(
        schedule?.publishedPosts
      )
    ) {
      return [];
    }

    return schedule.publishedPosts;
  };

  const getRepeatText = (schedule) => {
    if (!schedule?.repeatEnabled) {
      return "One time";
    }

    const every = Number(
      schedule.repeatEvery || 1
    );

    return every === 1
      ? "Every 1 day"
      : `Every ${every} days`;
  };

  const getScheduleContent = (schedule) => {
    return (
      schedule?.content ||
      null
    );
  };

  const getScheduleProductName = (schedule) => {
    return (
      schedule?.content?.product?.name ||
      schedule?.product?.name ||
      "Unknown Product"
    );
  };

  const getScheduleMedia = (schedule) => {
    return (
      schedule?.content?.media?.url ||
      schedule?.media?.url ||
      ""
    );
  };

  // =====================================================
  // CONTENT FILTER
  // =====================================================

  const filteredContents = useMemo(() => {
    let visible = contents.filter((item) => !item.archivedAt);
    if (statusFilter === "active") {
      visible = visible.filter((item) => item?.status !== "published");
    } else if (statusFilter !== "all") {
      visible = visible.filter((item) => item?.status === statusFilter);
    }

    return chooseContentPerProduct(visible);
  }, [contents, statusFilter]);

  const archivedContents = useMemo(
    () => contents.filter((item) => Boolean(item.archivedAt)),
    [contents]
  );

  const visibleSchedules = useMemo(
    () => schedules.filter((item) => ["scheduled", "processing", "failed"].includes(item.status)),
    [schedules]
  );

  // =====================================================
  // PUBLISHED HISTORY
  // =====================================================

  const publishedHistory = useMemo(() => {
    const history = [];

    schedules.forEach((schedule) => {
      const posts =
        getPublishedPosts(schedule);

      posts.forEach((post) => {
        if (!post?.success) {
          return;
        }

        history.push({
          ...post,

          scheduleId:
            schedule._id,

          productName:
            getScheduleProductName(
              schedule
            ),

          caption:
            schedule?.content?.caption ||
            "",

          content:
            schedule?.content ||
            null,
        });
      });
    });

    return history.sort(
      (a, b) =>
        new Date(
          b.publishedAt || 0
        ) -
        new Date(
          a.publishedAt || 0
        )
    );
  }, [schedules]);

  // =====================================================
  // FAILED HISTORY
  // =====================================================

  const failedHistory = useMemo(() => {
    const history = [];

    schedules.forEach((schedule) => {
      const posts =
        getPublishedPosts(schedule);

      posts.forEach((post) => {
        if (
          post?.success === false ||
          post?.error
        ) {
          history.push({
            ...post,

            scheduleId:
              schedule._id,

            productName:
              getScheduleProductName(
                schedule
              ),

            scheduledAt:
              schedule.scheduledAt,

            content:
              schedule?.content ||
              null,
          });
        }
      });

      if (
        schedule?.status === "failed" &&
        posts.length === 0
      ) {
        history.push({
          platform:
            schedule?.platform ||
            "unknown",

          postId: "",

          error:
            schedule?.errorMessage ||
            "Schedule publishing failed.",

          success: false,

          scheduleId:
            schedule._id,

          productName:
            getScheduleProductName(
              schedule
            ),

          scheduledAt:
            schedule.scheduledAt,

          content:
            schedule?.content ||
            null,
        });
      }
    });

    return history.sort(
      (a, b) =>
        new Date(
          b.scheduledAt || 0
        ) -
        new Date(
          a.scheduledAt || 0
        )
    );
  }, [schedules]);

  // =====================================================
  // COUNTS
  // =====================================================

  const counts = useMemo(() => {
    return {
      content:
        chooseContentPerProduct(
          contents.filter((item) => !item.archivedAt && item.status !== "published")
        ).length,
      scheduled:
        schedules.filter(
          (item) =>
            ["scheduled", "processing"].includes(item?.status)
        ).length,
      publishedPosts:
        publishedHistory.length,

      failedPosts:
        failedHistory.length,
    };
  }, [
    contents,
    schedules,
    publishedHistory,
    failedHistory,
  ]);

  // =====================================================
  // OPEN PUBLISHED URL
  // =====================================================

  const openPublishedPost = (post) => {
    if (!post) return;

    let url =
      post?.publishedUrl ||
      "";

    if (
      !url &&
      post?.platform === "facebook" &&
      post?.postId
    ) {
      url =
        `https://www.facebook.com/reel/${post.postId}`;
    }

    if (
      !url &&
      post?.platform === "instagram" &&
      post?.postId
    ) {
      url =
        `https://www.instagram.com/reel/${post.postId}/`;
    }

    if (!url) {
      return;
    }

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // =====================================================
  // DELETE CONTENT
  // =====================================================

  const setArchived = async (content, archived) => {
    if (!content?._id) return;
    try {
      await api.put(`/content/${content._id}/archive`, { archived });
      await loadEverything();
    } catch (error) {
      setError(error?.response?.data?.message || "Unable to update this content.");
    }
  };

  // =====================================================
  // APPROVE CONTENT
  // =====================================================

  const approveContent = async (content) => {
    if (!content?._id) {
      return;
    }

    try {

      await api.put(`/content/${content._id}/status`, { status: "approved" });

      await loadEverything();
    } catch (error) {
      console.error(
        "Approve content error:",
        error
      );

      setError(
        error?.response?.data?.message ||
          "Unable to approve content."
      );
    }
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <main className="min-h-screen overflow-x-hidden bg-gray-100">
      {/* HEADER */}

      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Content & Publishing
              </h1>

              <p className="mt-1 text-sm text-gray-500">
                Manage Reels, published posts,
                failed publishing and schedules
                from one place.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <button
                onClick={() => router.push("/admin-dashboard/content/add")}
                className="w-full rounded-lg border bg-white px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:w-auto sm:px-4"
              >
                + Create Content
              </button>
              <button
                onClick={refresh}
                disabled={refreshing}
                className="w-full rounded-lg border bg-white px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:w-auto sm:px-4"
              >
                {refreshing
                  ? "Refreshing..."
                  : "↻ Refresh"}
              </button>

            </div>
          </div>
        </div>
      </header>

      {/* ERROR */}

      {error && (
        <section className="mx-auto max-w-7xl px-3 pt-4 sm:px-6 sm:pt-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        </section>
      )}

      {/* STATS */}

      <section className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
          <Stat
            title="Needs attention"
            value={counts.content}
          />
          <Stat
            title="Upcoming schedules"
            value={counts.scheduled}
          />
          <Stat
            title="Published history"
            value={counts.publishedPosts}
          />
          <Stat
            title="Failed"
            value={counts.failedPosts}
            danger
          />
        </div>
      </section>

      {/* TABS */}

      <section className="mx-auto max-w-7xl px-3 sm:px-6">
        <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-xl border bg-white p-1.5 shadow-sm sm:gap-2 sm:p-2">
          <Tab
            active={
              activeTab === "content"
            }
            onClick={() =>
              setActiveTab("content")
            }
          >
            Content / Reels
          </Tab>

          <Tab
            active={
              activeTab === "published"
            }
            onClick={() =>
              setActiveTab("published")
            }
          >
            Published History
          </Tab>

          <Tab
            active={
              activeTab === "failed"
            }
            onClick={() =>
              setActiveTab("failed")
            }
          >
            Failed Publishing
            {counts.failedPosts > 0 && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">
                {counts.failedPosts}
              </span>
            )}
          </Tab>

          <Tab
            active={
              activeTab === "schedules"
            }
            onClick={() =>
              setActiveTab("schedules")
            }
          >
            Active Schedules
          </Tab>

          <Tab active={activeTab === "archived"} onClick={() => setActiveTab("archived")}>
            Archive{archivedContents.length > 0 && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px]">{archivedContents.length}</span>}
          </Tab>
        </div>
      </section>

      {/* CONTENT */}

      {activeTab === "content" && (
        <section className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Content / Reels
              </h2>

              <p className="text-sm leading-5 text-gray-500">Pending work lives here. Click × to archive finished items; publishing history stays saved.</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">One item per product is shown. Uploaded video is used when available; otherwise the product photo is posted.</p>
            </div>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value
                )
              }
              className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none sm:w-auto"
            >
              <option value="active">Needs attention</option>
              <option value="all">
                All active content
              </option>

              <option value="draft">Draft</option>

              <option value="approved">
                Approved
              </option>

              <option value="published">Published</option>

              <option value="scheduled">
                Scheduled
              </option>

              <option value="failed">
                Failed
              </option>

              <option value="rejected">
                Rejected
              </option>
            </select>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="rounded-2xl border bg-white p-10 text-center text-gray-500">Loading content...</div>
            ) : filteredContents.length === 0 ? (
              <div className="rounded-2xl border bg-white p-12 text-center">
                <div className="text-4xl">🎬</div>
                <p className="mt-3 font-semibold text-gray-700">Nothing needs attention</p>
                <p className="mt-1 text-sm text-gray-500">Published items are kept in Published History.</p>
              </div>
            ) : filteredContents.map((content) => {
              const mediaUrl = getMediaUrl(content);
              return (
                <article key={content._id} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 rounded-2xl border bg-white p-3 shadow-sm sm:flex sm:items-center sm:gap-4 sm:p-4">
                  {mediaUrl ? (
                    isVideo(content) ? (
                      <video src={mediaUrl} muted playsInline preload="metadata" className="h-28 w-20 shrink-0 rounded-xl bg-black object-cover sm:h-20 sm:w-28" />
                    ) : (
                      <Image src={mediaUrl} alt="" width={112} height={160} sizes="(max-width: 640px) 80px, 112px" className="h-28 w-20 shrink-0 rounded-xl bg-gray-100 object-cover sm:h-20 sm:w-28" />
                    )
                  ) : (
                    <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xs text-gray-400 sm:h-20 sm:w-28">No media</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-gray-900">{getProductName(content)}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(content.status)}`}>{getStatusLabel(content.status)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 break-words text-sm text-gray-600">{getCaption(content) || "No caption"}</p>
                    <p className="mt-2 break-words text-xs text-gray-500">
                      {content?.platform || "all"} · {content?.type || "post"}
                      {content?.product?.price !== undefined ? ` · Rs. ${content.product.price}` : ""}
                      {` · Added ${formatDate(content.createdAt)}`}
                    </p>
                  </div>
                  <div className="col-span-2 flex w-full flex-wrap items-center gap-2 sm:col-span-1 sm:w-auto sm:shrink-0">
                    {["draft", "generated"].includes(content.status) && (
                      <button onClick={() => approveContent(content)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Approve</button>
                    )}
                    {content.publishedUrl && (
                      <button onClick={() => openPublishedPost({ publishedUrl: content.publishedUrl, postId: content.publishedPostId, platform: content.platform })} className="rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">View post</button>
                    )}
                    <button type="button" title="Move to archive" aria-label={`Archive ${getProductName(content)}`} onClick={() => setArchived(content, true)} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-xl leading-none text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600">×</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "archived" && (
        <section className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">Archive</h2>
            <p className="text-sm text-gray-500">Removed from the work list. Restore anything you still need.</p>
          </div>
          <div className="space-y-3">
            {archivedContents.length === 0 ? (
              <div className="rounded-2xl border bg-white p-10 text-center text-gray-500">Archive is empty.</div>
            ) : archivedContents.map((content) => (
              <article key={content._id} className="flex flex-col gap-3 rounded-2xl border bg-white p-3 sm:flex-row sm:items-center sm:p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{getProductName(content)}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(content.status)}`}>{getStatusLabel(content.status)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-600">{getCaption(content) || "No caption"}</p>
                  <p className="mt-2 text-xs text-gray-500">Archived {formatDate(content.archivedAt)}</p>
                </div>
                <button onClick={() => setArchived(content, false)} className="w-full rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:w-auto">Restore</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* PUBLISHED HISTORY */}

      {activeTab === "published" && (
        <section className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">
              Published Content History
            </h2>

            <p className="text-sm text-gray-500">
              Facebook and Instagram publishing
              history.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            {publishedHistory.length ===
            0 ? (
              <div className="p-12 text-center text-gray-500">
                No published content history
                available.
              </div>
            ) : (
              <>
              <div className="space-y-3 p-3 sm:hidden">
                {publishedHistory.map((post, index) => (
                  <article key={`${post.scheduleId}-${post.platform}-${index}`} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getPlatformClass(post.platform)}`}>{post.platform}</span>
                      <span className="text-xs text-gray-500">{formatDate(post.publishedAt)}</span>
                    </div>
                    <p className="mt-3 break-words font-semibold text-gray-800">{post.productName}</p>
                    <p className="mt-1 break-all text-xs text-gray-500">{post.postId || "—"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => openPublishedPost(post)} disabled={!post.publishedUrl && !post.postId} className="min-h-10 flex-1 rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Open Post</button>
                      {post.content?._id && !post.content.archivedAt && (
                        <button type="button" onClick={() => setArchived(post.content, true)} className="min-h-10 rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700">Archive</button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[1100px]">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Platform
                      </th>

                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Product
                      </th>

                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Published
                      </th>

                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Post ID
                      </th>

                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {publishedHistory.map(
                      (post, index) => (
                        <tr
                          key={`${post.scheduleId}-${post.platform}-${index}`}
                          className="border-b last:border-b-0 hover:bg-gray-50"
                        >
                          <td className="px-5 py-5">
                            <span
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getPlatformClass(
                                post.platform
                              )}`}
                            >
                              {post.platform}
                            </span>
                          </td>

                          <td className="px-5 py-5">
                            <p className="font-semibold text-gray-800">
                              {
                                post.productName
                              }
                            </p>
                          </td>

                          <td className="px-5 py-5 text-sm text-gray-500">
                            {formatDate(
                              post.publishedAt
                            )}
                          </td>

                          <td className="px-5 py-5">
                            <code className="rounded bg-gray-100 px-2 py-1 text-xs">
                              {post.postId ||
                                "—"}
                            </code>
                          </td>

                          <td className="px-5 py-5">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openPublishedPost(post)}
                                disabled={!post.publishedUrl && !post.postId}
                                className="rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
                              >Open Post</button>
                              {post.content?._id && !post.content.archivedAt && (
                                <button
                                  type="button"
                                  title="Move content to archive"
                                  aria-label={`Archive ${post.productName}`}
                                  onClick={() => setArchived(post.content, true)}
                                  className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-xl leading-none text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                                >×</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* FAILED */}

      {activeTab === "failed" && (
        <section className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-900">
              Failed Publishing
            </h2>

            <p className="text-sm text-gray-500">
              Platform-wise publishing errors and
              failure details.
            </p>
          </div>

          <div className="space-y-4">
            {failedHistory.length === 0 ? (
              <div className="rounded-2xl border bg-white p-12 text-center text-gray-500">
                No failed publishing attempts.
              </div>
            ) : (
              failedHistory.map(
                (failure, index) => (
                  <div
                    key={`${failure.scheduleId}-${failure.platform}-${index}`}
                    className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${getPlatformClass(
                              failure.platform
                            )}`}
                          >
                            {failure.platform ||
                              "Unknown"}
                          </span>

                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                            Failed
                          </span>
                        </div>

                        <h3 className="mt-3 font-bold text-gray-900">
                          {
                            failure.productName
                          }
                        </h3>

                        <p className="mt-1 text-xs text-gray-500">
                          Scheduled:{" "}
                          {formatDate(
                            failure.scheduledAt
                          )}
                        </p>
                      </div>

                      <span className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
                        Automatic retry enabled
                      </span>
                    </div>

                    <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
                        Error Details
                      </p>

                      <p className="mt-2 break-words text-sm leading-6 text-red-800">
                        {failure.error ||
                          "Unknown publishing error."}
                      </p>
                    </div>

                    {failure.postId && (
                      <div className="mt-4">
                        <p className="text-xs text-gray-500">
                          Post ID
                        </p>

                        <code className="mt-1 block break-all rounded-lg bg-gray-100 p-3 text-xs">
                          {
                            failure.postId
                          }
                        </code>
                      </div>
                    )}
                  </div>
                )
              )
            )}
          </div>
        </section>
      )}

      {/* SCHEDULE MANAGEMENT */}

      {activeTab === "schedules" && (
        <section className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Schedule Management
              </h2>

              <p className="text-sm text-gray-500">
                View automatic Facebook and Instagram publishing and the next run time.
              </p>
            </div>

            <button
              onClick={() =>
                router.push(
                  "/admin-dashboard/schedules"
                )
              }
              className="rounded-lg border bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Open Full Schedule Page
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            {visibleSchedules.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                Automatic schedules will appear once Facebook and Instagram are connected and product content is approved.
              </div>
            ) : (
              <>
              <div className="space-y-3 p-3 sm:hidden">
                {visibleSchedules.map((schedule) => {
                  const mediaUrl = getScheduleMedia(schedule);
                  const platforms = getPlatforms(schedule);
                  return (
                    <article key={schedule._id} className="rounded-xl border p-3">
                      <div className="flex gap-3">
                        {mediaUrl ? (
                          <video src={mediaUrl} muted playsInline preload="metadata" className="h-24 w-20 shrink-0 rounded-lg bg-black object-cover" />
                        ) : (
                          <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[10px] text-gray-400">No Media</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words text-sm font-semibold text-gray-900">{getScheduleProductName(schedule)}</h3>
                          <p className="mt-1 line-clamp-2 break-words text-xs text-gray-600">{schedule?.content?.caption || "No caption"}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {platforms.map((platform) => <span key={platform} className={`rounded-full px-2 py-1 text-[10px] font-semibold ${getPlatformClass(platform)}`}>{platform}</span>)}
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${getStatusClass(schedule.status)}`}>{getStatusLabel(schedule.status)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div><p className="text-gray-500">Next run</p><p className="mt-1 font-medium text-gray-800">{formatDate(schedule.scheduledAt)}</p></div>
                        <div><p className="text-gray-500">Schedule</p><p className="mt-1 font-medium text-gray-800">{getRepeatText(schedule)}</p></div>
                      </div>
                      {schedule.errorMessage && <p className="mt-2 break-words text-xs text-red-600">{schedule.errorMessage}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {schedule.status === "published" && <span className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">Published</span>}
                        {schedule.status === "processing" && <span className="rounded-lg bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-700">Processing...</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[1250px]">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Content
                      </th>

                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Product
                      </th>

                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Platform
                      </th>

                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Schedule
                      </th>

                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Next Run
                      </th>

                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Status
                      </th>

                      <th className="px-5 py-4 text-left text-sm font-semibold">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleSchedules.map(
                      (schedule) => {
                        const mediaUrl =
                          getScheduleMedia(
                            schedule
                          );

                        const platforms =
                          getPlatforms(
                            schedule
                          );

                        return (
                          <tr
                            key={
                              schedule._id
                            }
                            className="border-b align-top last:border-b-0 hover:bg-gray-50"
                          >
                            <td className="px-5 py-5">
                              <div className="flex gap-3">
                                {mediaUrl ? (
                                  <video
                                    src={
                                      mediaUrl
                                    }
                                    muted
                                    playsInline
                                    preload="metadata"
                                    className="h-16 w-24 rounded-lg bg-black object-cover"
                                  />
                                ) : (
                                  <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">
                                    No Media
                                  </div>
                                )}

                                <div className="max-w-sm">
                                  <p className="line-clamp-3 text-sm text-gray-700">
                                    {
                                      schedule
                                        ?.content
                                        ?.caption
                                    }
                                  </p>

                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {schedule.autoDeletePrevious && (
                                      <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-semibold text-orange-700">
                                        Auto Delete
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-5">
                              <p className="font-semibold text-gray-800">
                                {getScheduleProductName(
                                  schedule
                                )}
                              </p>
                            </td>

                            <td className="px-5 py-5">
                              <div className="flex flex-wrap gap-2">
                                {platforms.map(
                                  (
                                    platform
                                  ) => (
                                    <span
                                      key={
                                        platform
                                      }
                                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getPlatformClass(
                                        platform
                                      )}`}
                                    >
                                      {
                                        platform
                                      }
                                    </span>
                                  )
                                )}
                              </div>
                            </td>

                            <td className="px-5 py-5">
                              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                                {getRepeatText(
                                  schedule
                                )}
                              </span>
                            </td>

                            <td className="px-5 py-5 text-sm text-gray-500">
                              {formatDate(
                                schedule.scheduledAt
                              )}
                            </td>

                            <td className="px-5 py-5">
                              <span
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusClass(
                                  schedule.status
                                )}`}
                              >
                                {getStatusLabel(
                                  schedule.status
                                )}
                              </span>

                              {schedule.errorMessage && (
                                <p className="mt-2 max-w-xs text-xs text-red-600">
                                  {
                                    schedule.errorMessage
                                  }
                                </p>
                              )}
                            </td>

                            <td className="px-5 py-5">
                              <div className="flex min-w-[130px] flex-col gap-2">
                                {schedule.autoManaged && schedule.status === "scheduled" && (
                                  <span className="rounded-lg bg-blue-50 px-3 py-2 text-center text-xs font-semibold text-blue-700">
                                    Automatic
                                  </span>
                                )}

                                {schedule.status ===
                                  "published" && (
                                  <span className="rounded-lg bg-green-50 px-3 py-2 text-center text-xs font-semibold text-green-700">
                                    Published
                                  </span>
                                )}

                                {schedule.status ===
                                  "processing" && (
                                  <span className="rounded-lg bg-yellow-50 px-3 py-2 text-center text-xs font-semibold text-yellow-700">
                                    Processing...
                                  </span>
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
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

// =====================================================
// STAT
// =====================================================

function Stat({
  title,
  value,
  danger,
}) {
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm sm:p-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
        {title}
      </p>

      <p
        className={`mt-1 text-xl font-bold sm:text-2xl ${
          danger
            ? "text-red-600"
            : "text-gray-900"
        }`}
      >
        {Number(value || 0).toLocaleString()}
      </p>
    </div>
  );
}

// =====================================================
// TAB
// =====================================================

function Tab({
  active,
  onClick,
  children,
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-none whitespace-nowrap rounded-lg px-3 py-2.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
        active
          ? "bg-black text-white"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}
