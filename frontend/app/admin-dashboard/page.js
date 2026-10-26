"use client";

import { useEffect, useState } from "react";
import api from "../../lib/api";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    products: 0,
    schedules: 0,
    views: 0,
    clicks: 0,
    whatsappClicks: 0,
    buyNowClicks: 0,
  });

  const [loading, setLoading] = useState(true);

  

  async function loadDashboard() {

    let products = [];
    let schedules = [];
    let analytics = {};

    // =========================
    // PRODUCTS
    // =========================

    try {
      const response = await api.get("/products");

      console.log(
        "PRODUCTS:",
        response.status,
        response.data
      );

      products = response.data?.products || [];
    } catch (error) {
      console.warn(
        "Products API:",
        error.response?.status,
        error.response?.data?.message ||
          error.message
      );
    }

    // =========================
    // SCHEDULES
    // =========================

    try {
      const response = await api.get("/schedules");

      console.log(
        "SCHEDULES:",
        response.status,
        response.data
      );

      schedules =
        response.data?.schedules || [];
    } catch (error) {
      console.warn(
        "Schedules API:",
        error.response?.status,
        error.response?.data?.message ||
          error.message
      );
    }

    // =========================
    // ANALYTICS
    // =========================

    try {
      const response = await api.get("/analytics");

      console.log(
        "ANALYTICS:",
        response.status,
        response.data
      );

      analytics =
        response.data?.analytics || {};
    } catch (error) {
      console.warn(
        "Analytics API:",
        error.response?.status,
        error.response?.data?.message ||
          error.message
      );
    }

    // =========================
    // SET DASHBOARD STATS
    // =========================

    setStats({
      products: Array.isArray(products)
        ? products.length
        : 0,

      schedules: Array.isArray(schedules)
        ? schedules.length
        : 0,

      views: Number(analytics.views) || 0,

      clicks: Number(analytics.clicks) || 0,

      whatsappClicks:
        Number(
          analytics.whatsappClicks
        ) || 0,

      buyNowClicks:
        Number(
          analytics.buyNowClicks
        ) || 0,
    });

    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => loadDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ================= MAIN ================= */}

      <main className="mx-auto max-w-7xl px-6 py-8">

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Overview
          </h2>

          <p className="mt-1 text-gray-500">
            Manage your ecommerce automation system.
          </p>
        </div>

        {loading ? (
          <div className="rounded-xl bg-white p-8 text-center">
            <p className="text-gray-500">
              Loading dashboard...
            </p>
          </div>
        ) : (
          <>
            {/* ================= STATS ================= */}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">

              <StatCard
                title="Products"
                value={stats.products}
              />

              <StatCard
                title="Scheduled Posts"
                value={stats.schedules}
              />

              <StatCard
                title="Total Views"
                value={stats.views}
              />

              <StatCard
                title="Total Clicks"
                value={stats.clicks}
              />

              <StatCard
                title="WhatsApp Clicks"
                value={stats.whatsappClicks}
              />

              <StatCard
                title="Buy Now Clicks"
                value={stats.buyNowClicks}
              />

            </div>

          </>
        )}

      </main>
    </div>
  );
}

// =========================
// STAT CARD
// =========================

function StatCard({ title, value }) {
  return (
    <div className="rounded-xl border bg-white p-6">
      <p className="text-sm text-gray-500">
        {title}
      </p>

      <p className="mt-2 text-3xl font-bold text-gray-900">
        {value}
      </p>
    </div>
  );
}

