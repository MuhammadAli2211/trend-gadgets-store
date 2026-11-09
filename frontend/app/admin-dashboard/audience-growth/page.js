"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../lib/api";

const initialDashboard = {
  totals: {}, followers: { facebook: null, instagram: null }, growth: [], categories: [],
  connectedAccounts: { facebook: false, instagram: false }, capabilities: {}, recentRuns: [],
};
const statusOptions = ["new", "review", "invited", "followed", "customer", "not_interested"];

function Stat({ label, value, note }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-950">{value ?? "—"}</p>
      {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
    </div>
  );
}

export default function AudienceGrowthPage() {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [prospects, setProspects] = useState([]);
  const [engagements, setEngagements] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [products, setProducts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [performance, setPerformance] = useState({ periods: {}, postingTimes: {} });
  const [performanceDays, setPerformanceDays] = useState("28");
  const [filters, setFilters] = useState({ platform: "", category: "", location: "", date: "", status: "", search: "" });
  const [selectedProduct, setSelectedProduct] = useState("");
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [filters]);

  const loadAll = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [dashboardResponse, prospectsResponse, engagementsResponse, campaignsResponse, productsResponse, recommendationsResponse, performanceResponse] = await Promise.all([
        api.get("/audience-growth/dashboard"),
        api.get(`/audience-growth/prospects${query ? `?${query}` : ""}`),
        api.get("/audience-growth/engagements?status=pending_review"),
        api.get("/audience-growth/campaigns"),
        api.get("/products?limit=100"),
      ]);
      setDashboard({ ...initialDashboard, ...(dashboardResponse.data || {}) });
      setProspects(prospectsResponse.data?.prospects || []);
      setEngagements(engagementsResponse.data?.engagements || []);
      setCampaigns(campaignsResponse.data?.campaigns || []);
      setProducts(productsResponse.data?.products || []);
      setRecommendations(recommendationsResponse.data?.recommendations || []);
      setPerformance(performanceResponse.data || { periods: {}, postingTimes: {} });
    } catch (loadError) {
      setError(loadError.response?.data?.message || "Audience growth data load nahi hua.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => { const timer = setTimeout(() => loadAll(), 0); return () => clearTimeout(timer); }, [loadAll]);

  const updateProspectStatus = async (id, status) => {
    setError("");
    try {
      await api.patch(`/audience-growth/prospects/${id}/status`, { status });
      await loadAll(false);
    } catch (updateError) { setError(updateError.response?.data?.message || "Prospect status update nahi hua."); }
  };

  const reviewEngagement = async (id, status) => {
    setError("");
    try {
      await api.patch(`/audience-growth/engagements/${id}/review`, { status });
      await loadAll(false);
    } catch (updateError) { setError(updateError.response?.data?.message || "Inquiry status update nahi hua."); }
  };

  const refreshMetrics = async () => {
    setRefreshing(true); setMessage(""); setError("");
    try {
      const response = await api.post("/audience-growth/snapshots/collect", {});
      const warnings = response.data?.warnings || [];
      setMessage(warnings.length ? "Refresh ho gaya; Meta ki kuch follower details permissions ki wajah se nahi milin." : "Facebook aur Instagram follower data refresh ho gaya.");
      await loadAll(false);
    } catch (refreshError) { setError(refreshError.response?.data?.message || "Metrics refresh nahi ho sake."); setRefreshing(false); }
  };

  const createCampaign = async (event) => {
    event.preventDefault(); setSavingCampaign(true); setMessage(""); setError("");
    try {
      const response = await api.post("/audience-growth/campaigns", { productId: selectedProduct, caption });
      setMessage(`Share link tayar: ${response.data?.campaign?.shareUrl || ""}`);
      setCaption("");
      await loadAll(false);
    } catch (campaignError) { setError(campaignError.response?.data?.message || "Share link create nahi hua."); }
    finally { setSavingCampaign(false); }
  };

  const copyText = async (value) => {
    try { await navigator.clipboard.writeText(value); setMessage("Link copy ho gaya."); }
    catch { setMessage(value); }
  };

  const totals = dashboard.totals || {};
  const growthPoints = useMemo(() => {
    const points = [...(dashboard.growth || [])].slice(-20);
    if (!points.length) return [];
    const max = Math.max(1, ...points.map((point) => Number(point.followers) || 0));
    return points.map((point, index) => ({ ...point, x: points.length === 1 ? 50 : (index / (points.length - 1)) * 100, y: 100 - ((Number(point.followers) || 0) / max) * 90 }));
  }, [dashboard.growth]);

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-700">Cart2Door</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-950">Audience Growth</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">Interested commenters, follower trend, share links aur review ke liye daily suggestions ek jagah.</p>
        </div>
        <button type="button" onClick={refreshMetrics} disabled={refreshing} className="min-h-10 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60">{refreshing ? "Refreshing…" : "↻ Refresh metrics"}</button>
      </section>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {message && <div role="status" className="break-words rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Prospects" value={loading ? "…" : totals.prospects || 0} note={`${totals.newToday || 0} naye aaj`} />
        <Stat label="Potential customers" value={loading ? "…" : totals.potentialCustomers || 0} note={`${totals.pendingEngagements || 0} inquiries review ke liye`} />
        <Stat label="Facebook followers" value={loading ? "…" : dashboard.followers?.facebook?.toLocaleString?.() ?? "—"} note={dashboard.connectedAccounts?.facebook ? "Connected Page" : "Page connected nahi"} />
        <Stat label="Instagram followers" value={loading ? "…" : dashboard.followers?.instagram?.toLocaleString?.() ?? "—"} note={dashboard.connectedAccounts?.instagram ? "Connected account" : "Account connected nahi"} />
        <Stat label="Tracked website visits" value={loading ? "…" : totals.websiteVisitsToday || 0} note="Aaj ke product page views" />
        <Stat label="WhatsApp clicks" value={loading ? "…" : totals.whatsappClicksToday || 0} note="Aaj ke tracked clicks" />
        <Stat label="Referral link visits" value={loading ? "…" : totals.referralVisits || 0} note={`${totals.referralVisitsToday || 0} aaj`} />
        <Stat label="Comments for review" value={loading ? "…" : totals.pendingEngagements || 0} note="Draft replies khud se send nahi hotay" />
      </section>

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-bold text-gray-900">Organic content & audience suggestions</h2>
          <p className="mt-1 text-xs text-gray-500">Product details se category-based audience ideas, caption hooks aur hashtags. Ye hypotheses hain—verified Meta targeting nahi.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {recommendations.slice(0, 6).map((item) => (
            <article key={item.productId} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start gap-3">
                {item.image ? <img src={item.image} alt="" className="h-16 w-16 rounded-md object-cover" /> : null}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm text-gray-900">{item.productName}</h3>
                  <p className="text-xs text-indigo-700">{item.audience?.category} · Audience: {(item.audience?.audience || []).join(", ")}</p>
                  <p className="mt-1 text-xs text-gray-600">Interest ideas: {(item.audience?.suggestedInterests || []).join(", ")}</p>
                </div>
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-900">{item.content?.hook}</p>
              <p className="mt-1 text-sm text-gray-700">{item.content?.caption}</p>
              <p className="mt-2 text-xs text-indigo-700">{(item.content?.hashtags || []).join(" ")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => copyText([item.content?.hook, item.content?.caption, (item.content?.hashtags || []).join(" ")].filter(Boolean).join("\n\n"))} className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold">Copy caption</button>
                <button type="button" onClick={() => setMessage("Content idea ready. Isay Content Generator mein review karke manual schedule karein.")} className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold">Use as idea</button>
              </div>
            </article>
          ))}
          {!recommendations.length && <p className="text-sm text-gray-500">Active products available hon to yahan content ideas nazar aayenge.</p>}
        </div>
        <div className="border-t border-gray-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-semibold text-gray-900">Organic performance learning</h3><p className="text-xs text-gray-500">Sirf currently recorded post metrics; missing Meta reach/non-follower data ko invent nahi kiya jata.</p></div>
            <select aria-label="Performance period" value={performanceDays} onChange={(event) => setPerformanceDays(event.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm"><option value="7">Last 7 days</option><option value="28">Last 28 days</option><option value="90">Last 90 days</option></select>
          </div>
          {(() => {
            const summary = performance.periods?.[performanceDays]?.total || {};
            return <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Post views" value={summary.available ? summary.views.toLocaleString() : "—"} note={summary.available ? `${summary.postsWithMetrics} posts with metrics` : "No recorded data"} />
              <Stat label="Likes" value={summary.available ? summary.likes.toLocaleString() : "—"} />
              <Stat label="Comments" value={summary.available ? summary.comments.toLocaleString() : "—"} />
              <Stat label="Shares" value={summary.available ? summary.shares.toLocaleString() : "—"} />
            </div>;
          })()}
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
            <p className="font-semibold text-gray-800">Best posting times (Pakistan time)</p>
            {performance.postingTimes?.available
              ? <ul className="mt-1 list-disc pl-5 text-gray-700">{performance.postingTimes.recommendations.map((slot) => <li key={slot.slot}>{slot.slot} — {slot.posts} posts, average engagement rate {(slot.averageEngagementRate * 100).toFixed(1)}%</li>)}</ul>
              : <p className="mt-1 text-gray-600">{performance.postingTimes?.reason || "Posting time recommendation abhi available nahi."}</p>}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold text-gray-900">Follower growth</h2><p className="text-xs text-gray-500">Meta API se daily snapshot; permission na ho to number khaali rahega.</p></div><span className="text-xs text-gray-500">Pichle 20 records</span></div>
          {growthPoints.length > 1 ? <svg viewBox="0 0 100 100" role="img" aria-label="Follower growth chart" className="mt-4 h-40 w-full overflow-visible"><polyline fill="none" stroke="#4f46e5" strokeWidth="2" points={growthPoints.map((point) => `${point.x},${point.y}`).join(" ")} />{growthPoints.map((point, index) => <circle key={`${point.platform}-${point.date}-${index}`} cx={point.x} cy={point.y} r="1.5" fill={point.platform === "instagram" ? "#db2777" : "#4f46e5"} />)}</svg> : <div className="mt-4 grid h-40 place-items-center rounded-lg bg-gray-50 px-4 text-center text-sm text-gray-500">Abhi follower history nahi. “Refresh metrics” dabao; Meta permission available ho to pehla record banega.</div>}
          <div className="mt-2 flex gap-4 text-xs text-gray-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-indigo-600" />Facebook</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-pink-600" />Instagram</span></div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-gray-900">Automation status</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p className="flex justify-between gap-2"><span>Facebook</span><strong className={dashboard.connectedAccounts?.facebook ? "text-emerald-700" : "text-amber-700"}>{dashboard.connectedAccounts?.facebook ? "Connected" : "Not connected"}</strong></p>
            <p className="flex justify-between gap-2"><span>Instagram</span><strong className={dashboard.connectedAccounts?.instagram ? "text-emerald-700" : "text-amber-700"}>{dashboard.connectedAccounts?.instagram ? "Connected" : "Not connected"}</strong></p>
          </div>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            <p className="font-semibold">Meta ki kuch cheezen abhi permission par depend karti hain</p>
            <p className="mt-1">Public hashtag se accounts dhoondhna abhi band hai jab tak Meta is feature ko approve na kare. Comment replies sirf draft banti hain. Facebook invite hamesha manually Business Suite mein review hoga.</p>
          </div>
          {(dashboard.recentRuns || []).length > 0 && <div className="mt-4"><h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Recent automations</h3><div className="mt-2 space-y-2">{dashboard.recentRuns.slice(0, 4).map((run) => <div key={run._id} className="flex items-start justify-between gap-3 text-xs"><span className="text-gray-700">{run.workflowName}</span><span className={run.status === "success" ? "text-emerald-700" : run.status === "failed" ? "text-red-700" : "text-amber-700"}>{run.status}</span></div>)}</div></div>}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-gray-900">Prospect list</h2><p className="text-xs text-gray-500">Sirf public account handle aur relevant comment signal save hota hai.</p></div><button type="button" onClick={() => { setRefreshing(true); loadAll(false); }} disabled={refreshing} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50">Refresh list</button></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <input aria-label="Search prospects" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Handle ya category" className="min-h-10 rounded-lg border border-gray-300 px-3 text-sm" />
          <select aria-label="Platform" value={filters.platform} onChange={(event) => setFilters((current) => ({ ...current, platform: event.target.value }))} className="min-h-10 rounded-lg border border-gray-300 px-3 text-sm"><option value="">All platforms</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="other">Other</option></select>
          <select aria-label="Category" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} className="min-h-10 rounded-lg border border-gray-300 px-3 text-sm"><option value="">All categories</option>{dashboard.categories?.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <input aria-label="Location" value={filters.location} onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))} placeholder="Location" className="min-h-10 rounded-lg border border-gray-300 px-3 text-sm" />
          <input aria-label="Date" type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} className="min-h-10 rounded-lg border border-gray-300 px-3 text-sm" />
          <select aria-label="Status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="min-h-10 rounded-lg border border-gray-300 px-3 text-sm"><option value="">All statuses</option>{statusOptions.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
        </div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-3">Account</th><th className="px-3 py-3">Platform</th><th className="px-3 py-3">Interest</th><th className="px-3 py-3">Location</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-100">{prospects.map((prospect) => <tr key={prospect._id}><td className="px-3 py-3"><a href={prospect.profileUrl || prospect.contentUrl || "#"} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 hover:underline">@{prospect.handle}</a>{prospect.contentUrl && <a href={prospect.contentUrl} target="_blank" rel="noreferrer" className="ml-2 text-xs text-gray-500 hover:underline">Content</a>}</td><td className="px-3 py-3 capitalize">{prospect.platform}</td><td className="px-3 py-3">{prospect.category || "—"}</td><td className="px-3 py-3">{prospect.location || "—"}</td><td className="px-3 py-3">{prospect.source?.replaceAll("_", " ")}</td><td className="px-3 py-3"><select aria-label={`Status for ${prospect.handle}`} value={prospect.status} onChange={(event) => updateProspectStatus(prospect._id, event.target.value)} className="min-h-9 rounded-md border border-gray-300 px-2 text-xs">{statusOptions.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></td></tr>)}{!loading && prospects.length === 0 && <tr><td colSpan="6" className="px-3 py-8 text-center text-sm text-gray-500">Koi prospect nahi mila. n8n daily comment scan ke baad interested comments yahan dikhte hain.</td></tr>}</tbody></table></div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><h2 className="font-bold text-gray-900">Customer questions</h2><p className="mt-1 text-xs text-gray-500">Suggested reply draft hai—send karne se pehle khud review karein.</p><div className="mt-3 space-y-3">{engagements.map((item) => <article key={item._id} className="rounded-lg border border-gray-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">@{item.actorHandle} · {item.platform}</strong><span className="text-xs text-gray-500">{item.intent?.replaceAll("_", " ")}</span></div><p className="mt-2 text-sm text-gray-700">{item.commentText}</p>{item.contentUrl && <a href={item.contentUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-indigo-700 hover:underline">Original post</a>}<div className="mt-2 rounded-md bg-gray-50 p-2 text-xs text-gray-700">Draft: {item.replyDraft}</div><div className="mt-3 flex gap-2"><button type="button" onClick={() => copyText(item.replyDraft)} className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold">Copy draft</button><button type="button" onClick={() => reviewEngagement(item._id, "replied_manually")} className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Mark replied</button><button type="button" onClick={() => reviewEngagement(item._id, "ignored")} className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold">Ignore</button></div></article>)}{!loading && engagements.length === 0 && <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">Abhi koi pending inquiry nahi hai.</p>}</div></div>
        <div className="space-y-4">
          <form onSubmit={createCampaign} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><h2 className="font-bold text-gray-900">Share link banao</h2><p className="mt-1 text-xs text-gray-500">Link par aane wale visits record honge. Post aap khud share karenge.</p><label className="mt-4 block text-xs font-semibold text-gray-700">Product<select required value={selectedProduct} onChange={(event) => setSelectedProduct(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm"><option value="">Select product</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} — Rs. {product.price}</option>)}</select></label><label className="mt-3 block text-xs font-semibold text-gray-700">Caption (optional)<textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={1000} rows={3} placeholder="Product ke liye share caption" className="mt-1 w-full rounded-lg border border-gray-300 p-3 text-sm" /></label><button disabled={savingCampaign || !selectedProduct} className="mt-3 min-h-10 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{savingCampaign ? "Creating…" : "Create tracked link"}</button></form>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><h2 className="font-bold text-gray-900">Tracked share links</h2><div className="mt-3 space-y-2">{campaigns.map((campaign) => <div key={campaign._id} className="rounded-lg border border-gray-200 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{campaign.product?.name || "Product"}</strong><span className="text-xs text-gray-500">{campaign.visits || 0} visits</span></div><p className="mt-1 break-all text-xs text-indigo-700">{campaign.shareUrl}</p><button type="button" onClick={() => copyText(campaign.shareUrl)} className="mt-2 rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold">Copy link</button></div>)}{!campaigns.length && <p className="text-sm text-gray-500">Abhi koi share link nahi bana.</p>}</div></div>
        </div>
      </section>
    </main>
  );
}
