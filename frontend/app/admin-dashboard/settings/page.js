"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function SettingsPage() {
  const [whatsappNumber, setWhatsappNumber] =
    useState("");

  const [whatsappMessage, setWhatsappMessage] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  // =========================
  // LOAD SETTINGS
  // =========================

  

  async function loadSettings() {
    try {

      const response = await api.get(
        "/admin/settings/whatsapp"
      );

      if (response.data.success) {
        setWhatsappNumber(
          response.data.settings
            ?.whatsappNumber || ""
        );

        setWhatsappMessage(
          response.data.settings
            ?.whatsappMessage || ""
        );
      }
    } catch (error) {
      console.error(
        "Load settings error:",
        error
      );

      setError(
        error.response?.data?.message ||
          "Failed to load settings"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => loadSettings(), 0);
    return () => clearTimeout(timeoutId);
  }, []);

  // =========================
  // SAVE SETTINGS
  // =========================

  const saveSettings = async (e) => {
    e.preventDefault();

    setMessage("");

    if (!whatsappNumber.trim()) {
      setError(
        "WhatsApp number is required."
      );

      return;
    }

    try {
      setSaving(true);

      const response = await api.put(
        "/admin/settings/whatsapp",
        {
          whatsappNumber,
          whatsappMessage,
        }
      );

      if (response.data.success) {
        setWhatsappNumber(
          response.data.settings
            ?.whatsappNumber || ""
        );

        setWhatsappMessage(
          response.data.settings
            ?.whatsappMessage || ""
        );

        setMessage(
          "WhatsApp settings saved successfully."
        );
      }
    } catch (error) {
      console.error(
        "Save settings error:",
        error
      );

      setError(
        error.response?.data?.message ||
          "Failed to save settings"
      );
    } finally {
      setSaving(false);
    }
  };

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <main className="p-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-gray-500">
            Loading settings...
          </p>
        </div>
      </main>
    );
  }

  // =========================
  // PAGE
  // =========================

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl">

        {/* HEADER */}

        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            Settings
          </h1>

          <p className="mt-2 text-gray-500">
            Manage your global WhatsApp settings.
          </p>
        </div>

        {/* WHATSAPP CARD */}

        <div className="rounded-2xl bg-white p-6 shadow-sm">

          <div className="mb-6">
            <h2 className="text-xl font-bold">
              WhatsApp Settings
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              This WhatsApp number will be used
              automatically for Buy Now on every
              product.
            </p>
          </div>

          <form onSubmit={saveSettings}>

            {/* NUMBER */}

            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold">
                WhatsApp Number
              </label>

              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) =>
                  setWhatsappNumber(
                    e.target.value
                  )
                }
                placeholder="923001234567"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-green-500"
              />

              <p className="mt-2 text-xs text-gray-500">
                Example: 923001234567
              </p>

              <p className="mt-1 text-xs text-gray-500">
                Country code ke sath number enter
                karein. + sign ki zaroorat nahi.
              </p>
            </div>

            {/* MESSAGE */}

            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold">
                Default WhatsApp Message
              </label>

              <textarea
                value={whatsappMessage}
                onChange={(e) =>
                  setWhatsappMessage(
                    e.target.value
                  )
                }
                rows={5}
                placeholder="Assalam o Alaikum, mujhe is product ke bare mein maloomat chahiye."
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-green-500"
              />

              <p className="mt-2 text-xs text-gray-500">
                Ye message har product ke Buy Now
                WhatsApp message ke start mein
                automatically add hoga.
              </p>
            </div>

            {/* SUCCESS */}

            {message && (
              <div className="mb-5 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                {message}
              </div>
            )}

            {/* ERROR */}

            {error && (
              <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            {/* SAVE */}

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : "Save WhatsApp Settings"}
            </button>

          </form>
        </div>

      </div>
    </main>
  );
}
