"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "../../../../../lib/api";

export default function EditContentPage() {
  const params = useParams();
  const router = useRouter();

  const contentId = params?.id;

  const [products, setProducts] = useState([]);

  const [form, setForm] = useState({
    product: "",
    type: "post",
    platform: "facebook",
    caption: "",
    status: "draft",
  });

  const [existingMedia, setExistingMedia] = useState(null);
  const [newMedia, setNewMedia] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  

  async function loadData() {
    try {

      const [contentResponse, productsResponse] =
        await Promise.all([
          api.get(`/content/${contentId}`),
          api.get("/products"),
        ]);

      if (contentResponse.data.success) {
        const content =
          contentResponse.data.content;

        setForm({
          product: content.product?._id || "",
          type: content.type || "post",
          platform: content.platform || "facebook",
          caption: content.caption || "",
          status: content.status || "draft",
        });

        setExistingMedia(content.media || null);
      }

      if (productsResponse.data.success) {
        setProducts(
          productsResponse.data.products || []
        );
      }
    } catch (error) {
      console.error("Load content error:", error);

      setError(
        error.response?.data?.message ||
          "Unable to load content."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!contentId) return;
    const timeoutId = setTimeout(() => loadData(), 0);
    return () => clearTimeout(timeoutId);
  }, [contentId]);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleMedia = (e) => {
    setNewMedia(e.target.files?.[0] || null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.product) {
      setError("Please select a product.");
      return;
    }

    try {
      setSaving(true);

      const formData = new FormData();

      formData.append("product", form.product);
      formData.append("type", form.type);
      formData.append("platform", form.platform);
      formData.append("caption", form.caption);
      formData.append("status", form.status);

      if (newMedia) {
        formData.append("media", newMedia);
      }

      const response = await api.put(
        `/content/${contentId}`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (response.data.success) {
        router.push("/admin-dashboard/content");
        router.refresh();
      } else {
        setError(
          response.data.message ||
            "Unable to update content."
        );
      }
    } catch (error) {
      console.error("Update content error:", error);

      setError(
        error.response?.data?.message ||
          "Unable to update content."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500">
          Loading content...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <h1 className="text-2xl font-bold text-gray-900">
            Edit Content
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Update your content.
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

          <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold">
              Product
            </label>

            <select
              name="product"
              value={form.product}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none"
            >
              <option value="">
                Select Product
              </option>

              {products.map((product) => (
                <option
                  key={product._id}
                  value={product._id}
                >
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold">
              Content Type
            </label>

            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none"
            >
              <option value="post">Post</option>
              <option value="reel">Reel</option>
              <option value="caption">Caption</option>
            </select>
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold">
              Platform
            </label>

            <select
              name="platform"
              value={form.platform}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none"
            >
              <option value="facebook">
                Facebook
              </option>

              <option value="instagram">
                Instagram
              </option>

              <option value="tiktok">
                TikTok
              </option>

              <option value="all">
                All Platforms
              </option>
            </select>
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold">
              Status
            </label>

            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none"
            >
              <option value="draft">Draft</option>
              <option value="approved">
                Approved
              </option>
              <option value="rejected">
                Rejected
              </option>
              <option value="scheduled">
                Scheduled
              </option>
              <option value="published">
                Published
              </option>
            </select>
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold">
              Caption
            </label>

            <textarea
              name="caption"
              value={form.caption}
              onChange={handleChange}
              rows={7}
              placeholder="Write your caption..."
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />
          </div>

          {existingMedia?.url && (
            <div className="mb-6">
              <label className="mb-3 block text-sm font-semibold">
                Current Media
              </label>

              {existingMedia.resourceType === "video" ? (
                <video
                  src={existingMedia.url}
                  controls
                  className="max-h-72 rounded-lg"
                />
              ) : (
                <img
                  src={existingMedia.url}
                  alt="Current content"
                  className="max-h-72 rounded-lg object-contain"
                />
              )}
            </div>
          )}

          <div className="mb-8">
            <label className="mb-2 block text-sm font-semibold">
              Replace Media
            </label>

            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleMedia}
              className="w-full rounded-lg border bg-white px-4 py-3"
            />

            {newMedia && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {newMedia.name}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() =>
                router.push("/admin-dashboard/content")
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
                : "Update Content"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
