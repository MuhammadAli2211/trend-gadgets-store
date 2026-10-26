"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import api from "../../../lib/api";

export default function ProductsPage() {
  const [products, setProducts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");

  

  async function loadProducts() {
    try {

      const response = await api.get("/products", {
        params: {
          search: search || undefined,
          category: category || undefined,
          status: status || undefined,
        },
      });

      if (response.data.success) {
        setProducts(response.data.products || []);
      }
    } catch (error) {
      console.error("Products loading error:", error);

      setError(
        error.response?.data?.message ||
          "Unable to load products"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => loadProducts(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    loadProducts();
  };

  const deleteProduct = async (id) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this product?"
    );

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/products/${id}`);

      setProducts((currentProducts) =>
        currentProducts.filter(
          (product) => product._id !== id
        )
      );
    } catch (error) {
      console.error(
        "Delete product error:",
        error
      );

      alert(
        error.response?.data?.message ||
          "Unable to delete product"
      );
    }
  };

  const toggleStatus = async (id) => {
    try {
      const response = await api.put(
        `/products/${id}/toggle-status`
      );

      if (response.data.success) {
        loadProducts();
      }
    } catch (error) {
      console.error(
        "Toggle status error:",
        error
      );

      alert(
        error.response?.data?.message ||
          "Unable to change product status"
      );
    }
  };

  const getImage = (product) => {
    if (!product?.images) {
      return "";
    }

    if (!Array.isArray(product.images)) {
      return "";
    }

    const firstImage = product.images[0];

    if (!firstImage) {
      return "";
    }

    if (typeof firstImage === "string") {
      return firstImage;
    }

    return (
      firstImage.url ||
      firstImage.secure_url ||
      firstImage.path ||
      ""
    );
  };

  return (
    <main className="min-h-screen bg-gray-100">

      {/* HEADER */}

      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Products
            </h1>

            <p className="text-sm text-gray-500">
              Manage your ecommerce products
            </p>
          </div>

        </div>
      </header>

      {/* CONTENT */}

      <section className="mx-auto max-w-7xl px-6 py-8">

        {/* TOP BAR */}

        <div className="mb-6 flex flex-col gap-4 rounded-xl border bg-white p-5 md:flex-row md:items-center md:justify-between">

          <form
            onSubmit={handleSearch}
            className="flex flex-1 gap-3"
          >
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:border-black"
            />

            <button
              type="submit"
              className="rounded-lg bg-black px-5 py-2.5 text-white hover:bg-gray-800"
            >
              Search
            </button>
          </form>

          <Link
            href="/admin-dashboard/products/add"
            className="rounded-lg bg-black px-5 py-2.5 text-center font-medium text-white hover:bg-gray-800"
          >
            + Add Product
          </Link>

        </div>

        {/* FILTERS */}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">

          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value)
            }
            className="rounded-lg border bg-white px-4 py-2.5 outline-none"
          >
            <option value="">
              All Categories
            </option>

            <option value="Toys">
              Toys
            </option>

            <option value="Photo Frames">
              Photo Frames
            </option>

            <option value="Electronics">
              Electronics
            </option>

            <option value="Clothing">
              Clothing
            </option>

            <option value="Other">
              Other
            </option>
          </select>

          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value)
            }
            className="rounded-lg border bg-white px-4 py-2.5 outline-none"
          >
            <option value="">
              All Status
            </option>

            <option value="active">
              Active
            </option>

            <option value="inactive">
              Inactive
            </option>
          </select>

          <button
            onClick={loadProducts}
            className="rounded-lg border bg-white px-5 py-2.5 hover:bg-gray-50"
          >
            Apply Filters
          </button>

        </div>

        {/* ERROR */}

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-600">
            {error}
          </div>
        )}

        {/* LOADING */}

        {loading ? (
          <div className="rounded-xl border bg-white p-10 text-center">
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border bg-white p-10 text-center">

            <h3 className="text-xl font-semibold">
              No Products Found
            </h3>

            <p className="mt-2 text-gray-500">
              Add your first product to get started.
            </p>

            <Link
              href="/admin-dashboard/products/add"
              className="mt-5 inline-block rounded-lg bg-black px-5 py-2.5 text-white"
            >
              Add Product
            </Link>

          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white">

            <div className="overflow-x-auto">

              <table className="w-full min-w-[900px]">

                <thead className="border-b bg-gray-50">

                  <tr>

                    <th className="px-5 py-4 text-left text-sm font-semibold">
                      Product
                    </th>

                    <th className="px-5 py-4 text-left text-sm font-semibold">
                      Category
                    </th>

                    <th className="px-5 py-4 text-left text-sm font-semibold">
                      Price
                    </th>

                    <th className="px-5 py-4 text-left text-sm font-semibold">
                      Status
                    </th>

                    <th className="px-5 py-4 text-left text-sm font-semibold">
                      Actions
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {products.map((product) => {

                    const image =
                      getImage(product);

                    return (
                      <tr
                        key={product._id}
                        className="border-b last:border-b-0"
                      >

                        {/* PRODUCT */}

                        <td className="px-5 py-4">

                          <div className="flex items-center gap-4">

                            <div className="h-16 w-16 overflow-hidden rounded-lg border bg-gray-100">

                              {image ? (
                                <img
                                  src={image}
                                  alt={product.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : product.video?.url ? (
                                <video src={product.video.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-gray-400">
                                  No Image
                                </div>
                              )}

                            </div>

                            <div>

                              <p className="font-semibold text-gray-900">
                                {product.name}
                              </p>

                              <p className="mt-1 max-w-xs truncate text-sm text-gray-500">
                                {product.description}
                              </p>

                            </div>

                          </div>

                        </td>

                        {/* CATEGORY */}

                        <td className="px-5 py-4 text-sm text-gray-600">
                          {product.category || "-"}
                        </td>

                        {/* PRICE */}

                        <td className="px-5 py-4 font-semibold">
                          Rs. {product.price}
                        </td>

                        {/* STATUS */}

                        <td className="px-5 py-4">

                          <button
                            onClick={() =>
                              toggleStatus(
                                product._id
                              )
                            }
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              product.isActive
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {product.isActive
                              ? "Active"
                              : "Inactive"}
                          </button>

                        </td>

                        {/* ACTIONS */}

                        <td className="px-5 py-4">

                          <div className="flex gap-2">

                            <Link
                              href={`/admin-dashboard/products/edit/${product._id}`}
                              className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                            >
                              Edit
                            </Link>

                            <button
                              onClick={() =>
                                deleteProduct(
                                  product._id
                                )
                              }
                              className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                            >
                              Delete
                            </button>
                            <button
  onClick={async () => {
    const confirmed = window.confirm(
      "Generate a Reel from this product's images?"
    );

    if (!confirmed) return;

    try {
      const response = await api.post(
        `/content/generate-reel/${product._id}`
      );

      if (response.data.success) {
        alert("Reel generated successfully!");
      }
    } catch (error) {
      console.error(
        "Generate reel error:",
        error
      );

      alert(
        error.response?.data?.message ||
          "Unable to generate reel."
      );
    }
  }}
  className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
>
  Generate Reel
</button>

                          </div>

                        </td>

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>

          </div>
        )}

      </section>

    </main>
  );
}
