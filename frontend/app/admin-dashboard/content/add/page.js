"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../../../lib/api";

export default function AddContentPage() {
  const router = useRouter();

  const [products, setProducts] = useState([]);

  const [form, setForm] = useState({
    product: "",
    type: "post",
    platform: "facebook",
    caption: "",
  });

  const [media, setMedia] = useState(null);

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  

  async function loadProducts() {
    try {

      const response = await api.get("/products");

      if (response.data.success) {
        setProducts(response.data.products || []);
      }
    } catch (error) {
      console.error("Load products error:", error);

      setError(
        error.response?.data?.message ||
          "Unable to load products."
      );
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => loadProducts(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleMedia = (e) => {
    const file = e.target.files?.[0] || null;

    setMedia(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.product) {
      setError("Please select a product.");
      return;
    }

    if (!form.type) {
      setError("Please select content type.");
      return;
    }

    if (!form.platform) {
      setError("Please select platform.");
      return;
    }

    if (form.type === "reel" && !media?.type?.startsWith("video/")) {
      setError("Reel content requires a video file.");
      return;
    }
    if (form.type === "post" && !media) {
      setError("Post content requires an image or video file.");
      return;
    }
    if (form.type === "caption" && !form.caption.trim()) {
      setError("Caption content cannot be empty.");
      return;
    }

    try {
      setSaving(true);

      const formData = new FormData();

      formData.append("product", form.product);
      formData.append("type", form.type);
      formData.append("platform", form.platform);
      formData.append("caption", form.caption);

      if (media) {
        formData.append("media", media);
      }

      const response = await api.post(
        "/content",
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
            "Unable to create content."
        );
      }
    } catch (error) {
      console.error("Create content error:", error);

      setError(
        error.response?.data?.message ||
          "Unable to create content."
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
            Create Content
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Create a social media post, reel or caption.
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

            {loadingProducts ? (
              <div className="rounded-lg border p-3 text-sm text-gray-500">
                Loading products...
              </div>
            ) : (
              <select
                name="product"
                value={form.product}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-black"
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
            )}
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-sm font-semibold">
              Content Type
            </label>

            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-black"
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
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-black"
            >
              <option value="facebook">
                Facebook
              </option>

              <option value="instagram">
                Instagram
              </option>

              <option value="tiktok" disabled>
                TikTok (not connected)
              </option>

              <option value="all">
                All Platforms
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

            <p className="mt-2 text-xs text-gray-500">
              You can later connect AI generation here.
            </p>
          </div>

          <div className="mb-8">
            <label className="mb-2 block text-sm font-semibold">
              Media
            </label>

            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleMedia}
              className="w-full rounded-lg border bg-white px-4 py-3"
            />

            {media && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {media.name}
              </p>
            )}

            <p className="mt-2 text-xs text-gray-500">
              {form.type === "reel" ? "Choose one video file for a Reel." : form.type === "post" ? "Choose one image or video file." : "Media is optional for caption-only Facebook posts."} Media uploads go to Cloudinary.
            </p>
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
                ? "Creating..."
                : "Create Content"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
