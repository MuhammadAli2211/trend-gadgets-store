
"use client";

import { useEffect, useState } from "react";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");

const INSTAGRAM_OAUTH_API_URL = (
  process.env.NEXT_PUBLIC_INSTAGRAM_OAUTH_API_URL || API_URL
).replace(/\/+$/, "");

export default function SocialAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [instagramConnecting, setInstagramConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const getToken = () => {
    if (typeof window === "undefined") return null;

    return (
      localStorage.getItem("token") ||
      localStorage.getItem("accessToken")
    );
  };

  const loadAccounts = async () => {
    try {
      const token = getToken();

      const headers = {};

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${API_URL}/social-accounts`, {
        method: "GET",
        headers,
        cache: "no-store",
      });

      const responseText = await response.text();

      let data = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(
          `Backend returned invalid response (${response.status})`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.message ||
            `Failed to load social accounts (${response.status})`
        );
      }

      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    } catch (err) {
      console.error("Load social accounts error:", err);

      setError(
        err?.message ||
          "Unable to connect to backend. Make sure backend is running on port 5000."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadAccounts();
      const params = new URLSearchParams(window.location.search);

      if (params.get("facebook") === "connected") {
        setMessage("Facebook Page successfully connected!");
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      if (params.get("facebook") === "error") {
        setError(params.get("message") || "Facebook connection failed.");
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      if (params.get("instagram") === "connected") {
        setMessage("Instagram account successfully connected!");
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      if (params.get("instagram") === "error") {
        setError(params.get("message") || "Instagram connection failed.");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  const startOAuth = async (platform) => {
    const token = getToken();
    if (!token) throw new Error("Please sign in as an admin first.");
    const oauthApiUrl = platform === "instagram" ? INSTAGRAM_OAUTH_API_URL : API_URL;
    const requestHeaders = { Authorization: `Bearer ${token}` };
    if (platform === "instagram" && oauthApiUrl.includes("ngrok")) {
      requestHeaders["ngrok-skip-browser-warning"] = "true";
    }
    const response = await fetch(`${oauthApiUrl}/social-accounts/${platform}/connect`, {
      method: "POST",
      headers: requestHeaders,
      credentials: "include",
    });
    const data = await response.json();
    if (!response.ok || !data.url) {
      throw new Error(data.message || `Could not start ${platform} authorization.`);
    }
    window.location.assign(data.url);
  };

  const connectFacebook = async () => {
    setConnecting(true);
    setMessage("");
    try {
      await startOAuth("facebook");
    } catch (err) {
      setError(err.message || "Facebook connection failed.");
      setConnecting(false);
    }
  };

  const connectInstagram = async () => {
    setInstagramConnecting(true);
    setMessage("");
    try {
      await startOAuth("instagram");
    } catch (err) {
      setError(err.message || "Instagram connection failed.");
      setInstagramConnecting(false);
    }
  };

  const disconnectAccount = async (id) => {
    const confirmed = window.confirm(
      "Are you sure you want to disconnect this account?"
    );

    if (!confirmed) return;

    try {
      setMessage("");

      const token = getToken();

      const headers = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${API_URL}/social-accounts/${id}`,
        {
          method: "DELETE",
          headers,
        }
      );

      const responseText = await response.text();

      let data = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(
          `Backend returned invalid response (${response.status})`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.message ||
            `Failed to disconnect account (${response.status})`
        );
      }

      setAccounts((prev) =>
        prev.filter((account) => account._id !== id)
      );

      setMessage(
        "Social account disconnected successfully."
      );
    } catch (err) {
      console.error(
        "Disconnect account error:",
        err
      );

      setError(
        err?.message ||
          "Failed to disconnect account."
      );
    }
  };

  const facebookAccounts = accounts.filter(
    (account) => account.platform === "facebook"
  );

  const instagramAccounts = accounts.filter(
    (account) => account.platform === "instagram"
  );

  const tiktokAccounts = accounts.filter(
    (account) => account.platform === "tiktok"
  );

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingBox}>
          <div style={styles.spinner}></div>
          <p>Loading social accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>
              Social Accounts
            </h1>

            <p style={styles.subtitle}>
              Connect your social media accounts to
              automatically publish your content.
            </p>
          </div>
        </div>

        {message && (
          <div style={styles.success}>
            <span style={styles.successIcon}>✓</span>

            <span>{message}</span>

            <button
              onClick={() => setMessage("")}
              style={styles.closeButton}
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <div style={styles.error}>
            <span style={styles.errorIcon}>!</span>

            <span>{error}</span>

            <button
              onClick={() => setError("")}
              style={styles.closeButton}
            >
              ×
            </button>
          </div>
        )}

        {/* FACEBOOK */}

        <div style={styles.card}>
          <div style={styles.cardTop}>

            <div style={styles.platformInfo}>

              <div
                style={{
                  ...styles.platformIcon,
                  background: "#1877F2",
                }}
              >
                f
              </div>

              <div>
                <h2 style={styles.platformName}>
                  Facebook
                </h2>

                <p style={styles.platformDescription}>
                  Publish posts and Reels to your
                  Facebook Page.
                </p>
              </div>

            </div>

            {facebookAccounts.length === 0 ? (
              <button
                onClick={connectFacebook}
                disabled={connecting}
                style={{
                  ...styles.connectButton,
                  opacity: connecting ? 0.7 : 1,
                }}
              >
                {connecting
                  ? "Connecting..."
                  : "Connect Facebook"}
              </button>
            ) : (
              <span style={styles.connectedBadge}>
                <span style={styles.greenDot}></span>
                Connected
              </span>
            )}

          </div>

          {facebookAccounts.length > 0 && (
            <div style={styles.accountsList}>
              {facebookAccounts.map((account) => (
                <div
                  key={account._id}
                  style={styles.accountRow}
                >

                  <div style={styles.accountLeft}>

                    <div style={styles.smallFacebookIcon}>
                      f
                    </div>

                    <div>
                      <div style={styles.accountName}>
                        {account.pageName ||
                          account.accountName ||
                          "Facebook Page"}
                      </div>

                      <div style={styles.accountDetails}>
                        Page ID:{" "}
                        {account.pageId ||
                          account.accountId ||
                          "N/A"}
                      </div>
                    </div>

                  </div>

                  <button
                    onClick={() =>
                      disconnectAccount(account._id)
                    }
                    style={styles.disconnectButton}
                  >
                    Disconnect
                  </button>

                </div>
              ))}
            </div>
          )}

          {facebookAccounts.length === 0 && (
            <div style={styles.notConnected}>
              <span>○</span>
              Facebook is not connected yet.
            </div>
          )}
        </div>

        {/* INSTAGRAM */}

        <div style={styles.card}>
          <div style={styles.cardTop}>

            <div style={styles.platformInfo}>

              <div style={styles.instagramIcon}>
                ◎
              </div>

              <div>
                <h2 style={styles.platformName}>
                  Instagram
                </h2>

                <p style={styles.platformDescription}>
                  Publish Reels and content to your
                  Instagram Professional account.
                </p>
              </div>

            </div>

            {instagramAccounts.length > 0 ? (
              <span style={styles.connectedBadge}>
                <span style={styles.greenDot}></span>
                Connected
              </span>
            ) : (
              <button
                onClick={connectInstagram}
                disabled={instagramConnecting}
                style={{
                  ...styles.instagramConnectButton,
                  opacity: instagramConnecting ? 0.7 : 1,
                }}
              >
                {instagramConnecting
                  ? "Connecting..."
                  : "Connect Instagram"}
              </button>
            )}

          </div>

          {instagramAccounts.length > 0 ? (
            <div style={styles.accountsList}>

              {instagramAccounts.map((account) => (
                <div
                  key={account._id}
                  style={styles.accountRow}
                >

                  <div style={styles.accountLeft}>

                    <div style={styles.smallInstagramIcon}>
                      ◎
                    </div>

                    <div>

                      <div style={styles.accountName}>
                        {account.instagramUsername
                          ? `@${account.instagramUsername}`
                          : account.accountName ||
                            "Instagram Account"}
                      </div>

                      <div style={styles.accountDetails}>
                        Instagram ID:{" "}
                        {account.instagramAccountId ||
                          account.accountId ||
                          "N/A"}
                      </div>

                    </div>

                  </div>

                  <button
                    onClick={() =>
                      disconnectAccount(account._id)
                    }
                    style={styles.disconnectButton}
                  >
                    Disconnect
                  </button>

                </div>
              ))}

            </div>
          ) : (
            <div style={styles.notConnected}>
              <span>○</span>
              No Instagram account connected.
            </div>
          )}

        </div>

        {/* TIKTOK */}

        <div style={styles.card}>
          <div style={styles.cardTop}>

            <div style={styles.platformInfo}>

              <div style={styles.tiktokIcon}>
                ♪
              </div>

              <div>
                <h2 style={styles.platformName}>
                  TikTok
                </h2>

                <p style={styles.platformDescription}>
                  Publish short videos directly to
                  your TikTok account.
                </p>
              </div>

            </div>

            {tiktokAccounts.length > 0 ? (
              <span style={styles.connectedBadge}>
                <span style={styles.greenDot}></span>
                Connected
              </span>
            ) : (
              <span style={styles.comingSoonBadge}>
                Not Connected
              </span>
            )}

          </div>

          {tiktokAccounts.length > 0 ? (
            <div style={styles.accountsList}>

              {tiktokAccounts.map((account) => (
                <div
                  key={account._id}
                  style={styles.accountRow}
                >

                  <div style={styles.accountLeft}>

                    <div style={styles.smallTikTokIcon}>
                      ♪
                    </div>

                    <div>

                      <div style={styles.accountName}>
                        {account.accountName ||
                          "TikTok Account"}
                      </div>

                      <div style={styles.accountDetails}>
                        Account ID:{" "}
                        {account.accountId || "N/A"}
                      </div>

                    </div>

                  </div>

                  <button
                    onClick={() =>
                      disconnectAccount(account._id)
                    }
                    style={styles.disconnectButton}
                  >
                    Disconnect
                  </button>

                </div>
              ))}

            </div>
          ) : (
            <div style={styles.notConnected}>
              <span>○</span>
              No TikTok account connected.
            </div>
          )}

        </div>

        {/* INFO */}

        <div style={styles.infoBox}>

          <div style={styles.infoIcon}>
            i
          </div>

          <div>

            <h3 style={styles.infoTitle}>
              How social publishing works
            </h3>

            <p style={styles.infoText}>
              Once an account is connected, your
              approved content can be used by the
              scheduler according to the schedule
              you create. You remain in control of
              the publishing days and times.
            </p>

          </div>

        </div>

      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fb",
    padding: "40px 20px",
    fontFamily: "Arial, Helvetica, sans-serif",
    boxSizing: "border-box",
  },

  container: {
    width: "100%",
    maxWidth: "1000px",
    margin: "0 auto",
  },

  header: {
    marginBottom: "30px",
  },

  title: {
    margin: 0,
    fontSize: "32px",
    fontWeight: "700",
    color: "#111827",
  },

  subtitle: {
    marginTop: "8px",
    marginBottom: 0,
    fontSize: "15px",
    color: "#6b7280",
    lineHeight: "1.6",
  },

  success: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    color: "#047857",
    padding: "13px 16px",
    borderRadius: "10px",
    marginBottom: "20px",
    fontSize: "14px",
  },

  successIcon: {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    background: "#10b981",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "700",
  },

  error: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    padding: "13px 16px",
    borderRadius: "10px",
    marginBottom: "20px",
    fontSize: "14px",
  },

  errorIcon: {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    background: "#ef4444",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "700",
  },

  closeButton: {
    marginLeft: "auto",
    border: "none",
    background: "transparent",
    color: "inherit",
    fontSize: "20px",
    cursor: "pointer",
  },

  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    marginBottom: "20px",
    overflow: "hidden",
    boxShadow: "0 3px 12px rgba(0,0,0,0.04)",
  },

  cardTop: {
    padding: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
  },

  platformInfo: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },

  platformIcon: {
    width: "52px",
    height: "52px",
    borderRadius: "13px",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "32px",
    fontWeight: "700",
    flexShrink: 0,
  },

  instagramIcon: {
    width: "52px",
    height: "52px",
    borderRadius: "13px",
    background:
      "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "34px",
    fontWeight: "400",
    flexShrink: 0,
  },

  tiktokIcon: {
    width: "52px",
    height: "52px",
    borderRadius: "13px",
    background: "#111827",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "30px",
    fontWeight: "700",
    flexShrink: 0,
  },

  platformName: {
    margin: 0,
    fontSize: "19px",
    fontWeight: "700",
    color: "#111827",
  },

  platformDescription: {
    margin: "5px 0 0",
    fontSize: "13px",
    color: "#6b7280",
    lineHeight: "1.5",
  },

  connectButton: {
    border: "none",
    background: "#1877F2",
    color: "#fff",
    padding: "11px 18px",
    borderRadius: "9px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  instagramConnectButton: {
    border: "none",
    background:
      "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)",
    color: "#fff",
    padding: "11px 18px",
    borderRadius: "9px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  connectedBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    background: "#ecfdf5",
    color: "#047857",
    border: "1px solid #a7f3d0",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },

  greenDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#10b981",
  },

  comingSoonBadge: {
    background: "#f3f4f6",
    color: "#6b7280",
    border: "1px solid #e5e7eb",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },

  accountsList: {
    borderTop: "1px solid #f0f0f0",
  },

  accountRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    padding: "18px 24px",
  },

  accountLeft: {
    display: "flex",
    alignItems: "center",
    gap: "13px",
  },

  smallFacebookIcon: {
    width: "38px",
    height: "38px",
    borderRadius: "9px",
    background: "#1877F2",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "23px",
    fontWeight: "700",
  },

  smallInstagramIcon: {
    width: "38px",
    height: "38px",
    borderRadius: "9px",
    background:
      "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "25px",
  },

  smallTikTokIcon: {
    width: "38px",
    height: "38px",
    borderRadius: "9px",
    background: "#111827",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "22px",
  },

  accountName: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#111827",
  },

  accountDetails: {
    marginTop: "4px",
    fontSize: "12px",
    color: "#9ca3af",
  },

  disconnectButton: {
    border: "1px solid #fecaca",
    background: "#fff",
    color: "#dc2626",
    padding: "8px 13px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },

  notConnected: {
    borderTop: "1px solid #f0f0f0",
    padding: "16px 24px",
    color: "#9ca3af",
    fontSize: "13px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  infoBox: {
    display: "flex",
    gap: "13px",
    padding: "18px 20px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: "12px",
    marginTop: "28px",
  },

  infoIcon: {
    width: "23px",
    height: "23px",
    borderRadius: "50%",
    background: "#2563eb",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: "700",
    flexShrink: 0,
  },

  infoTitle: {
    margin: 0,
    fontSize: "14px",
    fontWeight: "700",
    color: "#1e40af",
  },

  infoText: {
    margin: "5px 0 0",
    fontSize: "13px",
    lineHeight: "1.6",
    color: "#3b82f6",
  },

  loadingBox: {
    minHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    fontSize: "14px",
  },

  spinner: {
    width: "30px",
    height: "30px",
    border: "3px solid #e5e7eb",
    borderTop: "3px solid #1877F2",
    borderRadius: "50%",
    marginBottom: "12px",
    animation: "spin 0.8s linear infinite",
  },
};
