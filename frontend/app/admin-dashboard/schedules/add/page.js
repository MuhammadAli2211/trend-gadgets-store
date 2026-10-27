
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "../../../../lib/api";
import { localDateTimeToIso, toLocalDateTimeInput } from "../../../../lib/scheduleTime";

export default function AddSchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [preferredContentId, setPreferredContentId] = useState("");

  const [contents, setContents] = useState([]);

  const [form, setForm] = useState({
    content: "",
    platforms: ["facebook", "instagram"],
    scheduledAt: "",
    repeatEnabled: false,
    repeatEvery: 1,
    repeatUnit: "days",
    generateNewContent: true,
    autoDeletePrevious: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  

  async function loadApprovedContent() {
    try {

      const response = await api.get("/content", {
        params: {
          status: "approved",
        },
      });

      if (response.data.success) {
        const approvedContents = response.data.contents || [];
        setContents(approvedContents);

      }
    } catch (error) {
      console.error("Load approved content error:", error);

      setError(
        error.response?.data?.message ||
          "Unable to load approved content."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => loadApprovedContent(), 0);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const contentIdFromUrl = searchParams.get("content");
    const contentIdFromStorage = window.sessionStorage.getItem(
      "cart2door-schedule-content"
    );
    const contentId = contentIdFromUrl || contentIdFromStorage || "";

    if (contentId) {
      setPreferredContentId(contentId);
      window.sessionStorage.removeItem("cart2door-schedule-content");
    }
  }, [searchParams]);

  useEffect(() => {
    if (
      preferredContentId &&
      contents.some((content) => content._id === preferredContentId)
    ) {
      setForm((previous) => ({
        ...previous,
        content: preferredContentId,
      }));
    }
  }, [contents, preferredContentId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handlePlatformChange = (platform) => {
    setForm((previous) => {
      const alreadySelected =
        previous.platforms.includes(platform);

      if (alreadySelected) {
        return {
          ...previous,
          platforms: previous.platforms.filter(
            (item) => item !== platform
          ),
        };
      }

      return {
        ...previous,
        platforms: [...previous.platforms, platform],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.content) {
      setError("Please select approved content.");
      return;
    }

    if (
      !form.platforms ||
      form.platforms.length === 0
    ) {
      setError(
        "Please select at least one social media platform."
      );
      return;
    }

    if (!form.scheduledAt) {
      setError("Please select date and time.");
      return;
    }

    if (
      form.repeatEnabled &&
      (!form.repeatEvery ||
        Number(form.repeatEvery) < 1)
    ) {
      setError(
        "Repeat interval must be at least 1 day."
      );
      return;
    }

    try {
      setSaving(true);

      const payload = {
        content: form.content,

        // New backend format
        platforms: form.platforms,

        scheduledAt: localDateTimeToIso(form.scheduledAt),

        repeatEnabled: form.repeatEnabled,

        repeatEvery: Number(form.repeatEvery),

        repeatUnit: "days",

        generateNewContent:
          form.generateNewContent,

        autoDeletePrevious:
          form.autoDeletePrevious,
      };

      console.log(
        "CREATE SCHEDULE PAYLOAD:",
        payload
      );

      const response = await api.post(
        "/schedules",
        payload
      );

      if (response.data.success) {
        router.push("/admin-dashboard/schedules");
        router.refresh();
      } else {
        setError(
          response.data.message ||
            "Unable to create schedule."
        );
      }
    } catch (error) {
      console.error(
        "Create schedule error:",
        error
      );

      setError(
        error.response?.data?.message ||
          "Unable to create schedule."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <h1 className="text-2xl font-bold text-gray-900">
            Create Schedule
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Create one schedule and publish the same
            Reel/content to all selected platforms.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-8">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border bg-white p-6 shadow-sm"
        >
          {error && (
            <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* CONTENT */}

          <div className="mb-6">
            <label className="mb-2 block text-sm font-semibold">
              Approved Content
            </label>

            {loading ? (
              <div className="rounded-lg border p-4 text-sm text-gray-500">
                Loading approved content...
              </div>
            ) : contents.length === 0 ? (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
                No approved content available.
                Please approve a post or reel first.
              </div>
            ) : (
              <select
                name="content"
                value={form.content}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-black"
              >
                <option value="">
                  Select Content
                </option>

                {contents.map((content) => (
                  <option
                    key={content._id}
                    value={content._id}
                  >
                    {content.product?.name ||
                      "Product"}{" "}
                    — {content.type} —{" "}
                    {content.platform}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* PLATFORMS */}

          <div className="mb-6">
            <label className="mb-2 block text-sm font-semibold">
              Publish To
            </label>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* FACEBOOK */}

              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                  form.platforms.includes("facebook")
                    ? "border-black bg-gray-50"
                    : "border-gray-300 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.platforms.includes(
                    "facebook"
                  )}
                  onChange={() =>
                    handlePlatformChange(
                      "facebook"
                    )
                  }
                  className="h-4 w-4"
                />

                <div>
                  <p className="font-semibold text-gray-900">
                    Facebook
                  </p>

                  <p className="text-xs text-gray-500">
                    Facebook Page
                  </p>
                </div>
              </label>

              {/* INSTAGRAM */}

              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                  form.platforms.includes("instagram")
                    ? "border-black bg-gray-50"
                    : "border-gray-300 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.platforms.includes(
                    "instagram"
                  )}
                  onChange={() =>
                    handlePlatformChange(
                      "instagram"
                    )
                  }
                  className="h-4 w-4"
                />

                <div>
                  <p className="font-semibold text-gray-900">
                    Instagram
                  </p>

                  <p className="text-xs text-gray-500">
                    Instagram Reel
                  </p>
                </div>
              </label>

              {/* TIKTOK */}

              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                  form.platforms.includes("tiktok")
                    ? "border-black bg-gray-50"
                    : "border-gray-300 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.platforms.includes(
                    "tiktok"
                  )}
                  disabled
                  className="h-4 w-4"
                />

                <div>
                  <p className="font-semibold text-gray-900">
                    TikTok
                  </p>

                  <p className="text-xs text-gray-500">
                    Publishing not configured
                  </p>
                </div>
              </label>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Facebook and Instagram publish automatically at the selected time.
            </p>
          </div>

          {/* DATE */}

          <div className="mb-6">
            <label className="mb-2 block text-sm font-semibold">
              First Publish Date & Time (local time)
            </label>

            <input
              type="datetime-local"
              name="scheduledAt"
              value={form.scheduledAt}
              onChange={handleChange}
              min={toLocalDateTimeInput(new Date())}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />

            <p className="mt-2 text-xs text-gray-500">
              This is the first time your content will
              be published.
            </p>
          </div>

          {/* REPEAT */}

          <div className="mb-6 rounded-xl border bg-gray-50 p-5">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                name="repeatEnabled"
                checked={form.repeatEnabled}
                onChange={handleChange}
                className="h-4 w-4"
              />

              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Repeat this schedule
                </p>

                <p className="text-xs text-gray-500">
                  Automatically run this schedule again
                  after the selected number of days.
                </p>
              </div>
            </label>

            {form.repeatEnabled && (
              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold">
                  Repeat Every
                </label>

                <div className="flex items-center gap-3">
                  <select
                    name="repeatEvery"
                    value={form.repeatEvery}
                    onChange={handleChange}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-black"
                  >
                    {Array.from({ length: 365 }, (_, index) => index + 1).map((days) => (
                      <option key={days} value={days}>
                        Every {days} {days === 1 ? "Day" : "Days"}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="mt-2 text-xs text-gray-500">
                  The system will create the next run
                  automatically.
                </p>
              </div>
            )}
          </div>

          {/* FRESH CONTENT */}

          <div className="mb-4 rounded-xl border p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="generateNewContent"
                checked={form.generateNewContent}
                onChange={handleChange}
                className="mt-1 h-4 w-4"
              />

              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Generate fresh content every cycle
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  A new Reel will be generated
                  automatically for future runs instead
                  of repeatedly publishing the same Reel.
                </p>
              </div>
            </label>
          </div>

          {/* DELETE PREVIOUS */}

          <div className="mb-8 rounded-xl border p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="autoDeletePrevious"
                checked={form.autoDeletePrevious}
                onChange={handleChange}
                className="mt-1 h-4 w-4"
              />

              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Delete previous published post
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  On the next cycle, the system will
                  attempt to remove the previous published
                  post where the platform allows it.
                </p>
              </div>
            </label>
          </div>

          {/* ACTIONS */}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin-dashboard/schedules"
                )
              }
              className="rounded-lg border px-5 py-3 hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                saving ||
                loading ||
                contents.length === 0 ||
                form.platforms.length === 0
              }
              className="rounded-lg bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving
                ? "Scheduling..."
                : "Create Schedule"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
