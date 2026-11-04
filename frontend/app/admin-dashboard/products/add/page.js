"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../../../lib/api";
import { uploadProductVideo } from "../../../../lib/cloudinaryUpload";
import { getProductCategoryList, PRODUCT_CATEGORIES } from "../../../../lib/productCategories";

const MAX_UPLOAD_MEDIA_BYTES = 3.5 * 1024 * 1024;

const imageFileFromBlob = (blob, originalFile) => {
  const mimeType = blob.type || "image/webp";
  const extension = mimeType === "image/png" ? ".png" : mimeType === "image/jpeg" ? ".jpg" : ".webp";
  const safeName = originalFile.name.replace(/\.[^.]+$/, "") || "product-image";
  return new File([blob], `${safeName}${extension}`, {
    type: mimeType,
    lastModified: originalFile.lastModified,
  });
};

const compressImageToBudget = async (file, budgetBytes) => {
  if (file.size <= budgetBytes) return file;
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot optimize the selected photos. Please choose smaller images.");
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not optimize the selected photos. Please choose smaller images.");
  }

  let bestBlob = null;
  try {
    for (const maxDimension of [1800, 1500, 1200, 1000]) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.84, 0.74, 0.64, 0.54]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (!blob) continue;
        if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
        if (blob.size <= budgetBytes) return imageFileFromBlob(blob, file);
      }
    }
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }

  if (bestBlob && bestBlob.size < file.size && bestBlob.size <= budgetBytes) {
    return imageFileFromBlob(bestBlob, file);
  }
  throw new Error("Photos are still too large after optimization. Select fewer or smaller images.");
};

const prepareProductImages = async (images) => {
  const imageBudget = MAX_UPLOAD_MEDIA_BYTES;
  const totalImageBytes = images.reduce((total, file) => total + file.size, 0);
  if (totalImageBytes <= imageBudget) return images;

  const perImageBudget = Math.floor(imageBudget / images.length);
  const prepared = await Promise.all(images.map((file) => compressImageToBudget(file, perImageBudget)));
  const totalPreparedBytes = prepared.reduce((total, file) => total + file.size, 0);
  if (totalPreparedBytes > imageBudget) {
    throw new Error("Photos are still too large. Remove a photo or choose smaller images.");
  }
  return prepared;
};

export default function AddProductPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", description: "", price: "", category: "", tags: "" });
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState(PRODUCT_CATEGORIES);
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
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
      const preparedImages = await prepareProductImages(images);
      const uploadedVideos = [];
      for (let index = 0; index < videos.length; index += 1) {
        const file = videos[index];
        setUploadStatus(`Uploading video ${index + 1}/${videos.length}: 0%`);
        uploadedVideos.push(await uploadProductVideo(file, (percent) => {
          setUploadStatus(`Uploading video ${index + 1}/${videos.length}: ${percent}%`);
        }));
      }
      setUploadStatus(videos.length
        ? "Saving product and preparing a post from your video…"
        : "Saving product and preparing a post from its photo…");
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => data.append(key, value));
      preparedImages.forEach((file) => data.append("images", file));
      data.append("videoAssets", JSON.stringify(uploadedVideos));
      const response = await api.post("/products", data);
      if (response.data.success) router.push("/admin-dashboard/products");
    } catch (requestError) {
      const status = requestError.response?.status;
      setError(
        requestError.message === "Network Error" || status === 413
          ? "The photos/videos are too large for this upload. Choose fewer or smaller files and try again."
          : requestError.response?.data?.message || requestError.message || "Unable to create product."
      );
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
            {videos.length > 0 && <p className="text-xs text-gray-500">{videos.length} video(s) selected. Cart2Door will post your uploaded video with its original sound.</p>}
            {videos.length === 0 && <p className="text-xs text-gray-500">No product video selected. Cart2Door will post the first product photo as a regular photo post.</p>}
          </div>
          {uploadStatus && <p role="status" className="text-sm text-gray-600">{uploadStatus}</p>}
          <div className="flex gap-3"><button type="button" onClick={() => router.push("/admin-dashboard/products")} className="rounded-lg border px-5 py-3">Cancel</button><button type="submit" disabled={loading} className="rounded-lg bg-black px-6 py-3 font-semibold text-white disabled:opacity-50">{loading ? uploadStatus || "Creating…" : "Create Product"}</button></div>
        </form>
      </section>
    </main>
  );
}
