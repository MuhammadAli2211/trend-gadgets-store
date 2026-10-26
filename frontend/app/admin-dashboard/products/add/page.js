"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../../../lib/api";
import { getProductCategoryList, PRODUCT_CATEGORIES } from "../../../../lib/productCategories";

export default function AddProductPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", description: "", price: "", category: "", tags: "" });
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState(PRODUCT_CATEGORIES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/products").then((response) => {
      setCategories(getProductCategoryList(response.data.products || []));
    }).catch(() => {});
  }, []);

  const handleChange = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const handleImages = (event) => {
    const selected = Array.from(event.target.files || []);
    if (selected.length > 8) { setError("You can upload up to 8 photos."); event.target.value = ""; return; }
    setImages(selected); setError("");
  };
  const handleVideos = (event) => {
    const selected = Array.from(event.target.files || []);
    if (selected.length > 2) { setError("You can upload up to 2 videos."); event.target.value = ""; return; }
    setVideos(selected); setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault(); setError("");
    if (!images.length) { setError("Upload at least one product photo. You can also add videos."); return; }
    if (!form.category.trim()) { setError("Enter a product category."); return; }
    try {
      setLoading(true);
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => data.append(key, value));
      images.forEach((file) => data.append("images", file));
      videos.forEach((file) => data.append("videos", file));
      const response = await api.post("/products", data, { headers: { "Content-Type": "multipart/form-data" } });
      if (response.data.success) router.push("/admin-dashboard/products");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to create product.");
    } finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b bg-white"><div className="mx-auto max-w-4xl px-6 py-5"><h1 className="text-2xl font-bold">Add Product</h1><p className="mt-1 text-sm text-gray-500">Add product details, photos, videos, and social tags.</p></div></header>
      <section className="mx-auto max-w-4xl px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border bg-white p-6 shadow-sm">
          {error && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}
          <label className="block text-sm font-semibold">Product name<input name="name" value={form.name} onChange={handleChange} required maxLength={180} className="mt-2 w-full rounded-lg border px-4 py-3 font-normal" /></label>
          <label className="block text-sm font-semibold">Description<textarea name="description" value={form.description} onChange={handleChange} required maxLength={10000} rows={5} className="mt-2 w-full rounded-lg border px-4 py-3 font-normal" /></label>
          <label className="block text-sm font-semibold">Price (PKR)<input name="price" type="number" min="0" step="0.01" value={form.price} onChange={handleChange} required className="mt-2 w-full rounded-lg border px-4 py-3 font-normal" /></label>
          <label className="block text-sm font-semibold">Category<input name="category" value={form.category} onChange={handleChange} list="product-categories" required maxLength={100} placeholder="Choose an existing category or type a new one" className="mt-2 w-full rounded-lg border px-4 py-3 font-normal" /><datalist id="product-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist><span className="mt-1 block text-xs font-normal text-gray-500">New categories are added automatically when you save a product.</span></label>
          <label className="block text-sm font-semibold">Keywords<input name="tags" value={form.tags} onChange={handleChange} placeholder="cat, handmade, gift" className="mt-2 w-full rounded-lg border px-4 py-3 font-normal" /><span className="mt-1 block text-xs font-normal text-gray-500">Separate keywords with commas. They become hashtags in the social draft.</span></label>
          <div className="space-y-4 rounded-xl border p-4">
            <label className="block text-sm font-semibold">Product photos (up to 8)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImages} className="mt-2 block w-full rounded-lg border bg-white px-4 py-3 font-normal" /></label>
            {images.length > 0 && <p className="text-xs text-gray-500">{images.length} photo(s) selected. The first photo appears on the product card.</p>}
            <label className="block text-sm font-semibold">Product videos (up to 2)<input type="file" accept="video/mp4,video/quicktime,video/webm" multiple onChange={handleVideos} className="mt-2 block w-full rounded-lg border bg-white px-4 py-3 font-normal" /></label>
            {videos.length > 0 && <p className="text-xs text-gray-500">{videos.length} video(s) selected. All media appears on the product details page.</p>}
          </div>
          <div className="flex gap-3"><button type="button" onClick={() => router.push("/admin-dashboard/products")} className="rounded-lg border px-5 py-3">Cancel</button><button type="submit" disabled={loading} className="rounded-lg bg-black px-6 py-3 font-semibold text-white disabled:opacity-50">{loading ? "Creating…" : "Create Product"}</button></div>
        </form>
      </section>
    </main>
  );
}
