"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";

import api from "../../../../../lib/api";
import { uploadProductVideo } from "../../../../../lib/cloudinaryUpload";
import { getProductCategoryList, PRODUCT_CATEGORIES } from "../../../../../lib/productCategories";

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();

  const productId = params?.id;

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    category: "",
    tags: "",
  });

  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [existingVideos, setExistingVideos] = useState([]);
  const [newVideos, setNewVideos] = useState([]);
  const [categories, setCategories] = useState(PRODUCT_CATEGORIES);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");

  // =========================
  // LOAD PRODUCT
  // =========================

  

  const loadProduct = useCallback(async () => {
    try {

      const response = await api.get(
        `/products/${productId}`
      );

      if (!response.data.success) {
        setError(
          response.data.message ||
            "Unable to load product."
        );
        return;
      }

      const product = response.data.product;

      setForm({
        name: product.name || "",
        description:
          product.description || "",
        price: product.price || "",
        category: product.category || "",
        tags: (product.tags || []).join(", "),
      });

      setExistingImages(
        Array.isArray(product.images)
          ? product.images
          : []
      );
      const videos = [...(product.videos || [])];
      if (product.video?.url && !videos.some((item) => item.url === product.video.url)) videos.unshift(product.video);
      setExistingVideos(videos);
      api.get("/products").then((listResponse) => setCategories(getProductCategoryList(listResponse.data.products || []))).catch(() => {});
    } catch (error) {
      console.error(
        "Load product error:",
        error
      );

      setError(
        error.response?.data?.message ||
          "Unable to load product."
      );
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (!productId) return;
    const timeoutId = setTimeout(() => loadProduct(), 0);
    return () => clearTimeout(timeoutId);
  }, [productId, loadProduct]);

  // =========================
  // FORM CHANGE
  // =========================

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  // =========================
  // NEW IMAGES
  // =========================

  const handleImages = (e) => {
    const files = Array.from(
      e.target.files || []
    );

    if (files.length > 8) {
      setError(
        "Maximum 8 new images are allowed."
      );

      return;
    }
    setNewImages(files);
  };

  const handleVideos = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length + existingVideos.length > 2) {
      setError("A product can have up to 2 videos. Remove an existing video to replace it.");
      e.target.value = "";
      return;
    }
    setError("");
    setNewVideos(files);
  };

  // =========================
  // REMOVE EXISTING IMAGE
  // =========================

  const removeExistingImage = (index) => {
    setExistingImages((current) =>
      current.filter(
        (_, imageIndex) =>
          imageIndex !== index
      )
    );
  };

  // =========================
  // IMAGE URL
  // =========================

  const getImageUrl = (image) => {
    if (!image) {
      return "";
    }

    if (typeof image === "string") {
      return image;
    }

    return (
      image.url ||
      image.secure_url ||
      image.path ||
      ""
    );
  };

  // =========================
  // UPDATE PRODUCT
  // =========================

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setError(
        "Product name is required."
      );
      return;
    }

    if (!form.description.trim()) {
      setError(
        "Product description is required."
      );
      return;
    }

    if (!form.price) {
      setError(
        "Product price is required."
      );
      return;
    }

    if (!form.category) {
      setError(
        "Product category is required."
      );
      return;
    }
    if (existingImages.length === 0 && existingVideos.length === 0 && newVideos.length === 0) {
      setError("Keep or add at least one product image or video.");
      return;
    }

    try {
      setSaving(true);

      const uploadedVideos = [];
      for (let index = 0; index < newVideos.length; index += 1) {
        const file = newVideos[index];
        setUploadStatus(`Uploading video ${index + 1}/${newVideos.length}: 0%`);
        uploadedVideos.push(await uploadProductVideo(file, (percent) => {
          setUploadStatus(`Uploading video ${index + 1}/${newVideos.length}: ${percent}%`);
        }));
      }
      setUploadStatus("Saving product details…");

      const formData = new FormData();

      formData.append(
        "name",
        form.name
      );

      formData.append(
        "description",
        form.description
      );

      formData.append(
        "price",
        form.price
      );

      formData.append(
        "category",
        form.category
      );
      formData.append("tags", form.tags);

      // Existing images that user kept
      formData.append(
        "existingImages",
        JSON.stringify(existingImages)
      );

      // New images
      newImages.forEach((image) => {
        formData.append(
          "images",
          image
        );
      });
      formData.append("keepVideos", JSON.stringify(existingVideos));
      formData.append("videoAssets", JSON.stringify(uploadedVideos));

      const response = await api.put(
        `/products/${productId}`,
        formData,
        {
          headers: {
            "Content-Type":
              "multipart/form-data",
          },
        }
      );

      if (response.data.success) {
        router.push(
          "/admin-dashboard/products"
        );

        router.refresh();
      } else {
        setError(
          response.data.message ||
            "Unable to update product."
        );
      }
    } catch (error) {
      console.error(
        "Update product error:",
        error
      );

      setError(
        error.response?.data?.message ||
          "Unable to update product."
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
      <main className="min-h-screen bg-gray-100">
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-500">
            Loading product...
          </p>
        </div>
      </main>
    );
  }

  // =========================
  // PAGE
  // =========================

  return (
    <main className="min-h-screen bg-gray-100">

      {/* HEADER */}

      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-5">
          <button
            type="button"
            onClick={() => router.push("/admin-dashboard/products")}
            aria-label="Back to products"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xl hover:bg-gray-50"
          >
            ←
          </button>
          <div>

          <h1 className="text-2xl font-bold text-gray-900">
            Edit Product
          </h1>
          <p className="mt-1 text-sm text-gray-500">Back to products</p>
          </div>

          <p className="mt-1 text-sm text-gray-500">
            Update your product information.
          </p>

        </div>
      </header>

      {/* CONTENT */}

      <section className="mx-auto max-w-4xl px-6 py-8">

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border bg-white p-6 shadow-sm"
        >

          {/* ERROR */}

          {error && (
            <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* PRODUCT NAME */}

          <div className="mb-5">

            <label className="mb-2 block text-sm font-semibold">
              Product Name
            </label>

            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Enter product name"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />

          </div>

          {/* DESCRIPTION */}

          <div className="mb-5">

            <label className="mb-2 block text-sm font-semibold">
              Description
            </label>

            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Enter product description"
              rows={5}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />

          </div>

          {/* PRICE */}

          <div className="mb-5">

            <label className="mb-2 block text-sm font-semibold">
              Price
            </label>

            <input
              type="number"
              name="price"
              value={form.price}
              onChange={handleChange}
              placeholder="Enter price"
              min="0"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />

          </div>

          {/* CATEGORY */}

          <div className="mb-6">

            <label className="mb-2 block text-sm font-semibold">
              Category
            </label>

            <input
              name="category"
              value={form.category}
              onChange={handleChange}
              required
              list="product-categories"
              placeholder="Choose a category or enter a new one"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-black"
            />
            <datalist id="product-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
            <p className="mt-1 text-xs text-gray-500">New categories are saved when you update the product.</p>

          </div>

          <div className="mb-6">
            <label className="mb-2 block text-sm font-semibold">Keywords / hashtags</label>
            <input name="tags" value={form.tags} onChange={handleChange} placeholder="cat, handmade, gift" className="w-full rounded-lg border px-4 py-3" />
            <p className="mt-1 text-xs text-gray-500">Separate keywords with commas. They become hashtags in the social draft.</p>
          </div>

          {/* EXISTING IMAGES */}

          <div className="mb-6">

            <label className="mb-3 block text-sm font-semibold">
              Existing Images
            </label>

            {existingImages.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
                No existing images.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">

                {existingImages.map(
                  (image, index) => {
                    const imageUrl =
                      getImageUrl(image);

                    return (
                      <div
                        key={index}
                        className="relative h-32 overflow-hidden rounded-lg border"
                      >

                        {imageUrl ? (
                          <Image src={imageUrl} alt={`Product image ${index + 1}`} fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-gray-100 text-xs text-gray-400">
                            No Image
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            removeExistingImage(
                              index
                            )
                          }
                          className="absolute right-2 top-2 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          Remove
                        </button>

                      </div>
                    );
                  }
                )}

              </div>
            )}

          </div>

          {/* NEW IMAGES */}

          <div className="mb-8">

            <label className="mb-2 block text-sm font-semibold">
              Add New Images
            </label>

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImages}
              className="w-full rounded-lg border bg-white px-4 py-3"
            />

            <p className="mt-2 text-sm text-gray-500">Select new images if you want to add more product photos.</p>

            {newImages.length > 0 && (
              <p className="mt-2 text-sm font-medium text-gray-700">
                {newImages.length} new image(s)
                selected
              </p>
            )}

          </div>

          <div className="mb-8">
            <label className="mb-2 block text-sm font-semibold">Product videos (up to 2 total)</label>
            <div className="mb-3 flex flex-wrap gap-3">{existingVideos.map((video, index) => <div key={video.publicId || video.url} className="relative"><video src={video.url} controls className="h-24 rounded-lg" /><button type="button" onClick={() => setExistingVideos((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="mt-1 block rounded-lg border px-3 py-1 text-xs">Remove video {index + 1}</button></div>)}</div>
            <input type="file" accept="video/mp4,video/quicktime,video/webm" multiple onChange={handleVideos} className="w-full rounded-lg border bg-white px-4 py-3" />
            {newVideos.length > 0 && <p className="mt-2 text-sm">{newVideos.length} new video(s) selected.</p>}
            <p className="mt-2 text-xs text-gray-500">Videos upload directly to Cloudinary, so large files bypass the website server upload limit.</p>
          </div>

          {/* BUTTONS */}

          {uploadStatus && <p role="status" className="mb-4 text-sm text-gray-600">{uploadStatus}</p>}
          <div className="flex gap-3">

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin-dashboard/products"
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
                ? uploadStatus || "Updating..."
                : "Update Product"}
            </button>

          </div>

        </form>

      </section>

    </main>
  );
}
