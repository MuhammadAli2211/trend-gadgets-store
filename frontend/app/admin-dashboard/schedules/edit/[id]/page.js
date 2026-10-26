
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "../../../../../lib/api";

export default function EditSchedulePage() {
  const params = useParams();
  const router = useRouter();

  const scheduleId = params?.id;

  const [schedule, setSchedule] = useState(null);

  const [form, setForm] = useState({
    scheduledAt: "",
    platforms: ["facebook", "instagram"],
    repeatEnabled: false,
    repeatEvery: 1,
    repeatUnit: "days",
    generateNewContent: true,
    autoDeletePrevious: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  

  async function loadSchedule() {
    try {

      const response = await api.get(`/schedules/${scheduleId}`);

      if (response.data.success) {
        const data = response.data.schedule;

        setSchedule(data);

        const date = new Date(data.scheduledAt);

        const localDate = new Date(
          date.getTime() -
            date.getTimezoneOffset() * 60000
        )
          .toISOString()
          .slice(0, 16);

        setForm({
          scheduledAt: localDate,
          platforms: data.platforms?.length ? data.platforms : data.platform ? [data.platform] : ["facebook", "instagram"],
          repeatEnabled: data.repeatEnabled === true,
          repeatEvery: Math.min(365, Math.max(1, Number(data.repeatEvery) || 1)),
          repeatUnit: "days",
          generateNewContent:
            data.generateNewContent !== false,
          autoDeletePrevious:
            data.autoDeletePrevious !== false,
        });
      } else {
        setError(
          response.data.message ||
            "Unable to load schedule."
        );
      }
    } catch (error) {
      console.error("Load schedule error:", error);

      setError(
        error.response?.data?.message ||
          "Unable to load schedule."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!scheduleId) return;
    const timeoutId = setTimeout(() => loadSchedule(), 0);
    return () => clearTimeout(timeoutId);
  }, [scheduleId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setForm((previous) => ({
      ...previous,
      [name]:
        type === "checkbox" ? checked : value,
    }));
  };

  const handlePlatformChange = (platform) => {
    setForm((current) => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter((item) => item !== platform)
        : [...current.platforms, platform],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.platforms.length) {
      setError("Select at least one publishing destination.");
      return;
    }

    if (!form.scheduledAt) {
      setError("Please select date and time.");
      return;
    }

    if (
      form.repeatEnabled &&
      (!Number.isInteger(Number(form.repeatEvery)) || Number(form.repeatEvery) < 1 || Number(form.repeatEvery) > 365)
    ) {
      setError(
        "Repeat interval must be between 1 and 365 days."
      );
      return;
    }

    try {
      setSaving(true);

      const payload = {
        // IMPORTANT:
        platforms: form.platforms,

        scheduledAt: form.scheduledAt,

        repeatEnabled: Boolean(
          form.repeatEnabled
        ),

        repeatEvery: Number(
          form.repeatEvery
        ),

        repeatUnit: "days",

        generateNewContent: Boolean(
          form.generateNewContent
        ),

        autoDeletePrevious: Boolean(
          form.autoDeletePrevious
        ),
      };

      console.log(
        "Updating schedule with payload:",
        payload
      );

      const response = await api.put(
        `/schedules/${scheduleId}`,
        payload
      );

      if (response.data.success) {
        router.push(
          "/admin-dashboard/schedules"
        );

        router.refresh();
      } else {
        setError(
          response.data.message ||
            "Unable to update schedule."
        );
      }
    } catch (error) {
      console.error(
        "Update schedule error:",
        error
      );

      setError(
        error.response?.data?.message ||
          "Unable to update schedule."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500">
          Loading schedule...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <h1 className="text-2xl font-bold text-gray-900">
            Edit Schedule
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Update publishing time, repeat settings,
            and automatic content behavior.
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

          {/* CONTENT INFO */}

          <div className="mb-6 rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">
              Content
            </p>

            <p className="mt-1 font-semibold text-gray-900">
              {schedule?.content?.product?.name ||
                "Product"}
            </p>

            <p className="mt-1 text-sm capitalize text-gray-500">
              {schedule?.content?.type ||
                "Reel"}
            </p>
          </div>

          {/* PUBLISHING PLATFORMS */}

          <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
            <p className="mb-3 text-sm font-semibold text-gray-900">
              Publishing Platforms
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {[{ id: "facebook", title: "Facebook", note: "Connected Facebook Page" }, { id: "instagram", title: "Instagram", note: "Connected Instagram Business" }].map((platform) => <label key={platform.id} className="flex cursor-pointer items-center gap-3 rounded-lg border bg-white p-4"><input type="checkbox" checked={form.platforms.includes(platform.id)} onChange={() => handlePlatformChange(platform.id)} className="h-4 w-4" /><div><p className="text-sm font-semibold text-gray-900">{platform.title}</p><p className="text-xs text-gray-500">{platform.note}</p></div></label>)}
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Facebook and Instagram publish automatically at the selected time.
            </p>
          </div>

          {/* DATE */}

          <div className="mb-6">
            <label className="mb-2 block text-sm font-semibold">
              Next Publish Date & Time
            </label>

            <input
              type="datetime-local"
              name="scheduledAt"
              value={form.scheduledAt}
              onChange={handleChange}
              min={new Date()
                .toISOString()
                .slice(0, 16)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />

            <p className="mt-2 text-xs text-gray-500">
              For a recurring schedule, this controls
              the next scheduled run.
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
                  Automatically schedule the next run
                  after publishing.
                </p>
              </div>
            </label>

            {form.repeatEnabled && (
              <div className="mt-5">
                <label className="mb-2 block text-sm font-semibold">
                  Repeat Every
                </label>

                <select
                  name="repeatEvery"
                  value={form.repeatEvery}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-black"
                >
                  {Array.from({ length: 365 }, (_, index) => index + 1).map((days) => (
                    <option key={days} value={days}>
                      Every {days} {days === 1 ? "day" : "days"}
                    </option>
                  ))}
                </select>

                <p className="mt-2 text-xs text-gray-500">
                  Choose how many days to wait before
                  the next run (up to 365 days).
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
                  Future runs will automatically create
                  a fresh Reel instead of reusing the same
                  content.
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
                  The system will attempt to delete the
                  previous Facebook and Instagram post
                  before publishing the next one.
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
              disabled={saving}
              className="rounded-lg bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving
                ? "Updating..."
                : "Update Schedule"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
