"use client";

import { useEffect, useState } from "react";
import axios from "axios";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000/api";

const emptyAnalytics = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  clicks: 0,
  whatsappClicks: 0,
  buyNowClicks: 0,
};

const platformNames = [
  "facebook",
  "instagram",
  "tiktok",
  "website",
  "whatsapp",
];

const platformLabels = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  website: "Website",
  whatsapp: "WhatsApp",
};

function StatCard({
    title,
    value,
    icon,
}) {
    return (
      <div
        style={{
          background:
            "#ffffff",
          border:
            "1px solid #e5e7eb",
          borderRadius:
            "14px",
          padding:
            "20px",
          boxShadow:
            "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize:
                  "13px",
                color:
                  "#6b7280",
                marginBottom:
                  "8px",
              }}
            >
              {title}
            </div>

            <div
              style={{
                fontSize:
                  "28px",
                fontWeight:
                  "700",
                color:
                  "#111827",
              }}
            >
             {Number.isFinite(Number(value))
  ? Number(value).toLocaleString()
  : String(value ?? "0")} 
            </div>
          </div>

          <div
            style={{
              fontSize:
                "28px",
            }}
          >
            {icon}
          </div>
        </div>
      </div>
    );
  };



export default function AnalyticsPage() {
  const [analytics, setAnalytics] =
    useState(emptyAnalytics);

  const [platforms, setPlatforms] =
    useState({
      facebook: emptyAnalytics,
      instagram: emptyAnalytics,
      tiktok: emptyAnalytics,
      website: emptyAnalytics,
      whatsapp: emptyAnalytics,
    });

  const [topProducts, setTopProducts] =
    useState([]);

  const [topContents, setTopContents] =
    useState([]);

  const [period, setPeriod] =
    useState("all");

  const [loading, setLoading] =
    useState(true);

  const [syncing, setSyncing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [lastUpdated, setLastUpdated] =
    useState(null);

  // ===================================================
  // AUTH
  // ===================================================

  const getAuthHeaders = () => {
    if (
      typeof window === "undefined"
    ) {
      return {};
    }

    const token =
      localStorage.getItem("token");

    return token
      ? {
          Authorization:
            `Bearer ${token}`,
        }
      : {};
  };

  // ===================================================
  // FORMAT
  // ===================================================

  const formatNumber = (number) => {
    return Number(
      number || 0
    ).toLocaleString();
  };

  const formatPercent = (
    value
  ) => {
    return `${Number(
      value || 0
    ).toFixed(1)}%`;
  };

  const calculateCTR = (
    data
  ) => {
    const views =
      Number(
        data?.views || 0
      );

    const clicks =
      Number(
        data?.clicks || 0
      );

    if (!views) {
      return 0;
    }

    return (
      (clicks / views) *
      100
    );
  };

  const calculateWhatsAppRate = (
    data
  ) => {
    const views =
      Number(
        data?.views || 0
      );

    const clicks =
      Number(
        data?.whatsappClicks ||
          0
      );

    if (!views) {
      return 0;
    }

    return (
      (clicks / views) *
      100
    );
  };

  const calculateBuyRate = (
    data
  ) => {
    const views =
      Number(
        data?.views || 0
      );

    const clicks =
      Number(
        data?.buyNowClicks ||
          0
      );

    if (!views) {
      return 0;
    }

    return (
      (clicks / views) *
      100
    );
  };

  // ===================================================
  // LOAD PLATFORM
  // ===================================================

  const loadPlatform = async (
    platform
  ) => {
    try {
      const response =
        await axios.get(
          `${API_URL}/analytics/platform/${platform}?period=${period}`,
          {
            headers:
              getAuthHeaders(),
          }
        );

      return (
        response.data?.analytics ||
        emptyAnalytics
      );
    } catch (error) {
      console.error(
        `Failed to load ${platform} analytics:`,
        error
      );

      return emptyAnalytics;
    }
  };

  // ===================================================
  // LOAD ANALYTICS
  // ===================================================

  const loadAnalytics = async () => {
    try {
      const headers =
        getAuthHeaders();

      // OVERALL
      const overallResponse =
        await axios.get(
          `${API_URL}/analytics?period=${period}`,
          {
            headers,
          }
        );

      if (
        overallResponse.data
          ?.success
      ) {
        setAnalytics({
          ...emptyAnalytics,
          ...(
            overallResponse.data
              .analytics || {}
          ),
        });
      }

      // PLATFORMS
      const results =
        await Promise.all(
          platformNames.map(
            async (
              platform
            ) => {
              return {
                platform,
                data:
                  await loadPlatform(
                    platform
                  ),
              };
            }
          )
        );

      const nextPlatforms = {};

      results.forEach(
        (item) => {
          nextPlatforms[
            item.platform
          ] = {
            ...emptyAnalytics,
            ...item.data,
          };
        }
      );

      setPlatforms(
        nextPlatforms
      );

      // TOP PRODUCTS
      const productsResponse =
        await axios.get(
          `${API_URL}/analytics/top-products?limit=10&period=${period}`,
          {
            headers,
          }
        );

      if (
        productsResponse.data
          ?.success
      ) {
        setTopProducts(
          productsResponse.data
            .products || []
        );
      } else {
        setTopProducts([]);
      }

      // TOP CONTENT / REELS
      const contentResponse =
        await axios.get(
          `${API_URL}/analytics/top-content?limit=20&period=${period}`,
          {
            headers,
          }
        );

      if (
        contentResponse.data
          ?.success
      ) {
        setTopContents(
          contentResponse.data
            .contents || []
        );
      } else {
        setTopContents([]);
      }

      setLastUpdated(
        new Date()
      );
    } catch (error) {
      console.error(
        "Analytics loading error:",
        error
      );

      setError(
        error.response?.data
          ?.message ||
          "Failed to load analytics."
      );
    } finally {
      setLoading(false);
    }
  };

  // ===================================================
  // META SYNC
  // ===================================================

  const syncMeta = async () => {
    try {
      setSyncing(true);

      const response =
        await axios.post(
          `${API_URL}/analytics/sync-meta`,
          {},
          {
            headers:
              getAuthHeaders(),
          }
        );

      if (
        response.data?.result
          ?.errors?.length
      ) {
        const messages =
          response.data.result.errors
            .map(
              (item) =>
                `${item.platform}: ${item.message}`
            )
            .join(" | ");

        setError(messages);
      }

      await loadAnalytics();
    } catch (error) {
      console.error(
        "Meta sync error:",
        error
      );

      setError(
        error.response?.data
          ?.message ||
          "Meta sync failed."
      );
    } finally {
      setSyncing(false);
    }
  };

  // ===================================================
  // EFFECT
  // ===================================================

  useEffect(() => {
    const timeoutId = setTimeout(() => loadAnalytics(), 0);
    return () => clearTimeout(timeoutId);
  }, [period]);

  // ===================================================
  // STAT CARD
  // ===================================================

  // ===================================================
  // METRIC
  // ===================================================

  const Metric = ({
    label,
    value,
  }) => {
    return (
      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          padding:
            "8px 0",
          borderBottom:
            "1px solid #f3f4f6",
        }}
      >
        <span
          style={{
            color:
              "#6b7280",
            fontSize:
              "13px",
          }}
        >
          {label}
        </span>

        <strong>
          {formatNumber(
            value
          )}
        </strong>
      </div>
    );
  };

  // ===================================================
  // PLATFORM CARD
  // ===================================================

  const PlatformCard = ({
    platform,
    data,
  }) => {
    return (
      <div
        style={{
          background:
            "#ffffff",
          border:
            "1px solid #e5e7eb",
          borderRadius:
            "14px",
          padding:
            "20px",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
            marginBottom:
              "14px",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize:
                "17px",
            }}
          >
            {platformLabels[
              platform
            ]}
          </h3>

          <span
            style={{
              fontSize:
                "12px",
              padding:
                "5px 9px",
              borderRadius:
                "20px",
              background:
                "#f3f4f6",
            }}
          >
            {platform}
          </span>
        </div>

        <Metric
          label="Views"
          value={data.views}
        />

        <Metric
          label="Likes"
          value={data.likes}
        />

        <Metric
          label="Comments"
          value={
            data.comments
          }
        />

        <Metric
          label="Shares"
          value={data.shares}
        />

        <Metric
          label="Clicks"
          value={data.clicks}
        />

        <Metric
          label="WhatsApp"
          value={
            data.whatsappClicks
          }
        />

        <Metric
          label="Buy Now"
          value={
            data.buyNowClicks
          }
        />

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "1fr 1fr 1fr",
            gap:
              "8px",
            marginTop:
              "14px",
          }}
        >
          <div
            style={{
              background:
                "#f9fafb",
              padding:
                "9px",
              borderRadius:
                "8px",
              textAlign:
                "center",
            }}
          >
            <div
              style={{
                fontSize:
                  "11px",
                color:
                  "#6b7280",
              }}
            >
              CTR
            </div>

            <strong>
              {formatPercent(
                calculateCTR(
                  data
                )
              )}
            </strong>
          </div>

          <div
            style={{
              background:
                "#f9fafb",
              padding:
                "9px",
              borderRadius:
                "8px",
              textAlign:
                "center",
            }}
          >
            <div
              style={{
                fontSize:
                  "11px",
                color:
                  "#6b7280",
              }}
            >
              WhatsApp
            </div>

            <strong>
              {formatPercent(
                calculateWhatsAppRate(
                  data
                )
              )}
            </strong>
          </div>

          <div
            style={{
              background:
                "#f9fafb",
              padding:
                "9px",
              borderRadius:
                "8px",
              textAlign:
                "center",
            }}
          >
            <div
              style={{
                fontSize:
                  "11px",
                color:
                  "#6b7280",
              }}
            >
              Buy
            </div>

            <strong>
              {formatPercent(
                calculateBuyRate(
                  data
                )
              )}
            </strong>
          </div>
        </div>
      </div>
    );
  };

  // ===================================================
  // LOADING
  // ===================================================

  if (
    loading &&
    !lastUpdated
  ) {
    return (
      <div
        style={{
          padding:
            "30px",
        }}
      >
        <h1>
          Analytics
        </h1>

        <p>
          Loading analytics...
        </p>
      </div>
    );
  }

  // ===================================================
  // PAGE
  // ===================================================

  return (
    <div
      style={{
        padding:
          "30px",
        background:
          "#f9fafb",
        minHeight:
          "100vh",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          alignItems:
            "center",
          gap:
            "15px",
          flexWrap:
            "wrap",
          marginBottom:
            "25px",
        }}
      >
        <div>
          <h1
            style={{
              margin:
                "0 0 6px",
              fontSize:
                "28px",
            }}
          >
            Analytics
          </h1>

          <p
            style={{
              margin: 0,
              color:
                "#6b7280",
            }}
          >
            Complete performance
            of your products,
            reels and social
            platforms.
          </p>
        </div>

        <div
          style={{
            display:
              "flex",
            gap:
              "10px",
            alignItems:
              "center",
            flexWrap:
              "wrap",
          }}
        >
          {/* PERIOD */}

          <select
            value={period}
            onChange={(e) =>
              setPeriod(
                e.target.value
              )
            }
            style={{
              padding:
                "10px 14px",
              border:
                "1px solid #d1d5db",
              borderRadius:
                "8px",
              background:
                "#ffffff",
              cursor:
                "pointer",
            }}
          >
            <option value="all">
              All Time
            </option>

            <option value="today">
              Today
            </option>

            <option value="7d">
              Last 7 Days
            </option>

            <option value="30d">
              Last 30 Days
            </option>
          </select>

          <button
            onClick={
              loadAnalytics
            }
            disabled={
              loading
            }
            style={{
              padding:
                "10px 15px",
              border:
                "1px solid #d1d5db",
              borderRadius:
                "8px",
              background:
                "#ffffff",
              cursor:
                "pointer",
              fontWeight:
                "600",
            }}
          >
            {loading
              ? "Refreshing..."
              : "↻ Refresh"}
          </button>

          <button
            onClick={
              syncMeta
            }
            disabled={
              syncing
            }
            style={{
              padding:
                "10px 15px",
              border: "none",
              borderRadius:
                "8px",
              background:
                "#111827",
              color:
                "#ffffff",
              cursor:
                "pointer",
              fontWeight:
                "600",
            }}
          >
            {syncing
              ? "Syncing..."
              : "Sync Meta"}
          </button>
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <div
          style={{
            background:
              "#fef2f2",
            color:
              "#b91c1c",
            border:
              "1px solid #fecaca",
            padding:
              "12px 15px",
            borderRadius:
              "10px",
            marginBottom:
              "20px",
          }}
        >
          {error}
        </div>
      )}

      {/* PERIOD */}

      <div
        style={{
          marginBottom:
            "20px",
          color:
            "#6b7280",
          fontSize:
            "13px",
        }}
      >
        Showing:
        {" "}
        <strong
          style={{
            color:
              "#111827",
          }}
        >
          {period ===
          "all"
            ? "All Time"
            : period ===
                "today"
              ? "Today"
              : period ===
                  "7d"
                ? "Last 7 Days"
                : "Last 30 Days"}
        </strong>

        {lastUpdated && (
          <>
            {" "}
            • Updated{" "}
            {lastUpdated.toLocaleTimeString()}
          </>
        )}
      </div>

      {/* OVERALL */}

      <h2
        style={{
          fontSize:
            "20px",
          marginBottom:
            "15px",
        }}
      >
        Overall Performance
      </h2>

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap:
            "15px",
          marginBottom:
            "30px",
        }}
      >
        <StatCard
          title="Views"
          value={
            analytics.views
          }
          icon="👁️"
        />

        <StatCard
          title="Likes"
          value={
            analytics.likes
          }
          icon="❤️"
        />

        <StatCard
          title="Comments"
          value={
            analytics.comments
          }
          icon="💬"
        />

        <StatCard
          title="Shares"
          value={
            analytics.shares
          }
          icon="🔁"
        />

        <StatCard
          title="Clicks"
          value={
            analytics.clicks
          }
          icon="🖱️"
        />

        <StatCard
          title="WhatsApp Clicks"
          value={
            analytics.whatsappClicks
          }
          icon="📱"
        />

        <StatCard
          title="Buy Now Clicks"
          value={
            analytics.buyNowClicks
          }
          icon="🛒"
        />

        <StatCard
          title="CTR"
          value={`${calculateCTR(
            analytics
          ).toFixed(1)}%`}
          icon="📊"
        />
      </div>

      {/* CONVERSION */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap:
            "15px",
          marginBottom:
            "30px",
        }}
      >
        <div
          style={{
            background:
              "#ffffff",
            border:
              "1px solid #e5e7eb",
            borderRadius:
              "14px",
            padding:
              "18px",
          }}
        >
          <div
            style={{
              color:
                "#6b7280",
              fontSize:
                "13px",
            }}
          >
            WhatsApp Conversion
          </div>

          <div
            style={{
              fontSize:
                "25px",
              fontWeight:
                "700",
              marginTop:
                "5px",
            }}
          >
            {formatPercent(
              calculateWhatsAppRate(
                analytics
              )
            )}
          </div>
        </div>

        <div
          style={{
            background:
              "#ffffff",
            border:
              "1px solid #e5e7eb",
            borderRadius:
              "14px",
            padding:
              "18px",
          }}
        >
          <div
            style={{
              color:
                "#6b7280",
              fontSize:
                "13px",
            }}
          >
            Buy Now Conversion
          </div>

          <div
            style={{
              fontSize:
                "25px",
              fontWeight:
                "700",
              marginTop:
                "5px",
            }}
          >
            {formatPercent(
              calculateBuyRate(
                analytics
              )
            )}
          </div>
        </div>
      </div>

      {/* PLATFORMS */}

      <h2
        style={{
          fontSize:
            "20px",
          marginBottom:
            "15px",
        }}
      >
        Platform Performance
      </h2>

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(260px, 1fr))",
          gap:
            "15px",
          marginBottom:
            "35px",
        }}
      >
        {platformNames.map(
          (platform) => (
            <PlatformCard
              key={platform}
              platform={
                platform
              }
              data={
                platforms[
                  platform
                ] ||
                emptyAnalytics
              }
            />
          )
        )}
      </div>

      {/* PRODUCTS */}

      <div
        style={{
          background:
            "#ffffff",
          border:
            "1px solid #e5e7eb",
          borderRadius:
            "14px",
          padding:
            "20px",
          marginBottom:
            "35px",
          overflowX:
            "auto",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
            marginBottom:
              "18px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize:
                "20px",
            }}
          >
            Product Performance
          </h2>

          <span
            style={{
              color:
                "#6b7280",
              fontSize:
                "13px",
            }}
          >
            Top 10
          </span>
        </div>

        {topProducts.length ===
        0 ? (
          <div
            style={{
              padding:
                "30px",
              textAlign:
                "center",
              color:
                "#6b7280",
            }}
          >
            No product analytics
            available yet.
          </div>
        ) : (
          <table
            style={{
              width:
                "100%",
              borderCollapse:
                "collapse",
              minWidth:
                "1000px",
            }}
          >
            <thead>
              <tr>
                {[
                  "Product",
                  "Category",
                  "Views",
                  "Clicks",
                  "WhatsApp",
                  "Buy Now",
                  "Likes",
                  "Comments",
                  "Shares",
                  "CTR",
                ].map(
                  (
                    heading
                  ) => (
                    <th
                      key={
                        heading
                      }
                      style={{
                        textAlign:
                          "left",
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #e5e7eb",
                        fontSize:
                          "12px",
                        color:
                          "#6b7280",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {
                        heading
                      }
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {topProducts.map(
                (
                  product
                ) => (
                  <tr
                    key={
                      product.productId
                    }
                  >
                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap:
                            "10px",
                        }}
                      >
                        {product.image ? (
                          <img
                            src={
                              product.image
                            }
                            alt={
                              product.name
                            }
                            style={{
                              width:
                                "45px",
                              height:
                                "45px",
                              objectFit:
                                "cover",
                              borderRadius:
                                "8px",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width:
                                "45px",
                              height:
                                "45px",
                              background:
                                "#f3f4f6",
                              borderRadius:
                                "8px",
                            }}
                          />
                        )}

                        <div>
                          <div
                            style={{
                              fontWeight:
                                "600",
                            }}
                          >
                            {
                              product.name
                            }
                          </div>

                          <div
                            style={{
                              fontSize:
                                "12px",
                              color:
                                "#6b7280",
                            }}
                          >
                            Rs.{" "}
                            {formatNumber(
                              product.price
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {
                        product.category ||
                        "-"
                      }
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        product.views
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        product.clicks
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        product.whatsappClicks
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                        fontWeight:
                          "700",
                      }}
                    >
                      {formatNumber(
                        product.buyNowClicks
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        product.likes
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        product.comments
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        product.shares
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatPercent(
                        calculateCTR(
                          product
                        )
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* CONTENT / REELS */}

      <div
        style={{
          background:
            "#ffffff",
          border:
            "1px solid #e5e7eb",
          borderRadius:
            "14px",
          padding:
            "20px",
          overflowX:
            "auto",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
            marginBottom:
              "18px",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize:
                  "20px",
              }}
            >
              Reel / Content Performance
            </h2>

            <p
              style={{
                margin:
                  "5px 0 0",
                color:
                  "#6b7280",
                fontSize:
                  "13px",
              }}
            >
              Dekho kaunsi Reel
              sab se achi perform
              kar rahi hai.
            </p>
          </div>

          <span
            style={{
              color:
                "#6b7280",
              fontSize:
                "13px",
            }}
          >
            Top 20
          </span>
        </div>

        {topContents.length ===
        0 ? (
          <div
            style={{
              padding:
                "30px",
              textAlign:
                "center",
              color:
                "#6b7280",
            }}
          >
            No Reel / Content
            analytics available
            yet.
          </div>
        ) : (
          <table
            style={{
              width:
                "100%",
              borderCollapse:
                "collapse",
              minWidth:
                "1200px",
            }}
          >
            <thead>
              <tr>
                {[
                  "Content",
                  "Product",
                  "Platform",
                  "Status",
                  "Views",
                  "Likes",
                  "Comments",
                  "Shares",
                  "Clicks",
                  "WhatsApp",
                  "Buy Now",
                  "CTR",
                  "Open",
                ].map(
                  (
                    heading
                  ) => (
                    <th
                      key={
                        heading
                      }
                      style={{
                        textAlign:
                          "left",
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #e5e7eb",
                        fontSize:
                          "12px",
                        color:
                          "#6b7280",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {
                        heading
                      }
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {topContents.map(
                (
                  content
                ) => (
                  <tr
                    key={
                      content.contentId
                    }
                  >
                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap:
                            "10px",
                          maxWidth:
                            "250px",
                        }}
                      >
                        {content.mediaUrl ? (
                          <img
                            src={
                              content.mediaUrl
                            }
                            alt={
                              content.title
                            }
                            style={{
                              width:
                                "60px",
                              height:
                                "60px",
                              objectFit:
                                "cover",
                              borderRadius:
                                "8px",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width:
                                "60px",
                              height:
                                "60px",
                              background:
                                "#f3f4f6",
                              borderRadius:
                                "8px",
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                              fontSize:
                                "11px",
                            }}
                          >
                            Reel
                          </div>
                        )}

                        <div
                          style={{
                            overflow:
                              "hidden",
                          }}
                        >
                          <div
                            style={{
                              fontWeight:
                                "600",
                              whiteSpace:
                                "nowrap",
                              overflow:
                                "hidden",
                              textOverflow:
                                "ellipsis",
                            }}
                          >
                            {
                              content.title
                            }
                          </div>

                          <div
                            style={{
                              fontSize:
                                "11px",
                              color:
                                "#6b7280",
                            }}
                          >
                            {
                              content.type
                            }
                          </div>
                        </div>
                      </div>
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap:
                            "8px",
                        }}
                      >
                        {content.productImage && (
                          <img
                            src={
                              content.productImage
                            }
                            alt=""
                            style={{
                              width:
                                "35px",
                              height:
                                "35px",
                              objectFit:
                                "cover",
                              borderRadius:
                                "6px",
                            }}
                          />
                        )}

                        <span>
                          {
                            content.productName
                          }
                        </span>
                      </div>
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          gap:
                            "5px",
                          flexWrap:
                            "wrap",
                        }}
                      >
                        {(
                          content.platforms ||
                          []
                        ).map(
                          (
                            item
                          ) => (
                            <span
                              key={
                                item
                              }
                              style={{
                                background:
                                  "#f3f4f6",
                                padding:
                                  "4px 7px",
                                borderRadius:
                                  "12px",
                                fontSize:
                                  "11px",
                              }}
                            >
                              {
                                platformLabels[
                                  item
                                ] ||
                                item
                              }
                            </span>
                          )
                        )}
                      </div>
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      <span
                        style={{
                          background:
                            "#f3f4f6",
                          padding:
                            "5px 8px",
                          borderRadius:
                            "12px",
                          fontSize:
                            "11px",
                        }}
                      >
                        {
                          content.status ||
                          "-"
                        }
                      </span>
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        content.views
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        content.likes
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        content.comments
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        content.shares
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        content.clicks
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatNumber(
                        content.whatsappClicks
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                        fontWeight:
                          "700",
                      }}
                    >
                      {formatNumber(
                        content.buyNowClicks
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {formatPercent(
                        calculateCTR(
                          content
                        )
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "12px",
                        borderBottom:
                          "1px solid #f3f4f6",
                      }}
                    >
                      {content.publishedUrl ? (
                        <a
                          href={
                            content.publishedUrl
                          }
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color:
                              "#2563eb",
                            textDecoration:
                              "none",
                            fontWeight:
                              "600",
                          }}
                        >
                          View
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* FOOTER NOTE */}

      <div
        style={{
          marginTop:
            "20px",
          padding:
            "14px",
          background:
            "#f3f4f6",
          borderRadius:
            "10px",
          color:
            "#6b7280",
          fontSize:
            "12px",
        }}
      >
        Meta data Facebook/Instagram
        se sync hota hai. Website,
        WhatsApp aur Buy Now actions
        system ke tracking endpoints
        se record hote hain.
      </div>
    </div>
  );
} 
