"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import api from "../../../lib/api";
import { toWhatsAppPhone } from "../../../lib/phone";

export default function ProductPage() {
  const params = useParams();
  const routeProductId = params?.id;

  const [product, setProduct] = useState(null);

  const [whatsappSettings, setWhatsappSettings] =
    useState({
      whatsappNumber: "",
      whatsappMessage: "",
    });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedImage, setSelectedImage] = useState(0);

  // =========================
  // ORDER FORM
  // =========================

  const [showOrderForm, setShowOrderForm] =
    useState(false);

  const [orderLoading, setOrderLoading] =
    useState(false);

  const [orderError, setOrderError] =
    useState("");

  const [orderForm, setOrderForm] = useState({
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    quantity: 1,
    notes: "",
  });

  // =========================
  // LOAD PRODUCT + WHATSAPP
  // =========================

  

  const loadProduct = useCallback(async () => {
    try {

      const [
        productResponse,
        whatsappResponse,
      ] = await Promise.all([
        api.get(
          `/public/products/${routeProductId}`
        ),

        api.get(
          "/public/settings/whatsapp"
        ),
      ]);

      // PRODUCT
      if (productResponse.data.success) {
        setProduct(
          productResponse.data.product
        );
      }

      // WHATSAPP SETTINGS
      if (whatsappResponse.data.success) {
        setWhatsappSettings({
          whatsappNumber:
            whatsappResponse.data.settings
              ?.whatsappNumber || "",

          whatsappMessage:
            whatsappResponse.data.settings
              ?.whatsappMessage || "",
        });
      }
    } catch (error) {
      console.error(
        "Load Product Error:",
        error
      );

      setError(
        error.response?.data?.message ||
          "Product not found"
      );
    } finally {
      setLoading(false);
    }
  }, [routeProductId]);

  useEffect(() => {
    if (!routeProductId) return;
    const timeoutId = setTimeout(() => loadProduct(), 0);
    return () => clearTimeout(timeoutId);
  }, [routeProductId, loadProduct]);

  // =========================
  // TRACK ANALYTICS
  // =========================

  const productId = product?._id;
  const trackEvent = useCallback(async (type) => {
    if (!productId) return;

    try {
      await api.post(
        `/public/tracking/${type}`,
        {
          productId,
          contentId: "",
          source: "product-page",
          platform: "website",
        }
      );
    } catch (error) {
      console.error(
        `Failed to track ${type}:`,
        error.message
      );
    }
  }, [productId]);

  useEffect(() => {
    if (product?._id) trackEvent("view");
  }, [product?._id, trackEvent]);

  // =========================
  // OPEN WHATSAPP ORDER
  // =========================

  const buyNow = () => {
    if (!product) return;

    const phone = toWhatsAppPhone(whatsappSettings.whatsappNumber);
    if (!phone) {
      setOrderError("WhatsApp number is not configured. Please contact admin.");
      setShowOrderForm(true);
      return;
    }

    trackEvent("click");
    trackEvent("whatsapp");

    const productUrl = `${window.location.origin}/product/${product._id}`;
    const message = [
      "Assalam o Alaikum, mujhe yeh product order karna hai:",
      product.name,
      `Price: Rs. ${Number(product.price || 0).toLocaleString()}`,
      `Product link: ${productUrl}`,
      product.images?.[0]?.url ? `Product image: ${product.images[0].url}` : "",
    ].filter(Boolean).join("\n");

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // =========================
  // FORM INPUT
  // =========================

  const handleInputChange = (e) => {
    const {
      name,
      value,
    } = e.target;

    setOrderForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // =========================
  // CREATE ORDER
  // =========================

  const submitOrder = async (e) => {
    e.preventDefault();

    if (!product) return;

    setOrderError("");

    const customerName =
      orderForm.customerName.trim();

    const customerPhone =
      orderForm.customerPhone.trim();

    const customerAddress =
      orderForm.customerAddress.trim();

    const quantity =
      Number(orderForm.quantity);

    // =========================
    // VALIDATION
    // =========================

    if (!customerName) {
      setOrderError(
        "Please enter your name."
      );

      return;
    }

    if (!customerPhone) {
      setOrderError(
        "Please enter your phone number."
      );

      return;
    }

    if (!customerAddress) {
      setOrderError(
        "Please enter your address."
      );

      return;
    }

    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      setOrderError(
        "Quantity must be a whole number between 1 and 100."
      );

      return;
    }

    // =========================
    // WHATSAPP CHECK
    // =========================

    if (
      !whatsappSettings.whatsappNumber
    ) {
      setOrderError(
        "WhatsApp number is not configured. Please contact admin."
      );

      return;
    }

    const whatsappWindow = window.open("about:blank", "_blank");

    try {
      setOrderLoading(true);

      // =========================
      // CREATE ORDER
      // =========================

      const response = await api.post(
        "/orders",
        {
          customerName,
          customerPhone,
          customerAddress,
          productId: product._id,
          quantity,
          source: "website",
          contentId: "",
          notes:
            orderForm.notes.trim(),
        }
      );

      if (!response.data?.success) {
        throw new Error(
          response.data?.message ||
            "Failed to create order."
        );
      }

      const createdOrder =
        response.data.order;

      // =========================
      // WHATSAPP ANALYTICS
      // =========================
      //
      // IMPORTANT:
      // buyNowClicks is already incremented
      // inside orderController when order
      // is successfully created.
      //
      // So we ONLY track whatsapp here.
      // This prevents buyNowClicks from
      // being counted twice.
      // =========================

      await trackEvent("whatsapp");

      // =========================
      // TOTAL
      // =========================

      const totalAmount =
        Number(
          createdOrder?.totalAmount ||
            Number(product.price || 0) *
              quantity
        );

      // =========================
      // WHATSAPP MESSAGE
      // =========================

      const defaultMessage =
        `Assalam o Alaikum, I want to buy:\n\n` +
        `Order ID: ${
          createdOrder?._id || ""
        }\n` +
        `Product: ${product.name}\n` +
        `Price: Rs. ${Number(
          product.price || 0
        ).toLocaleString()}\n` +
        `Quantity: ${quantity}\n` +
        `Total: Rs. ${totalAmount.toLocaleString()}\n\n` +
        `Customer Name: ${customerName}\n` +
        `Phone: ${customerPhone}\n` +
        `Address: ${customerAddress}\n` +
        `Product image: ${product.images?.[0]?.url || "Image not available"}\n` +
        `Product ID: ${product._id}`;

      const message =
        whatsappSettings.whatsappMessage
          ? `${whatsappSettings.whatsappMessage}\n\n${defaultMessage}`
          : defaultMessage;

      // =========================
      // WHATSAPP URL
      // =========================

      const whatsappUrl =
        `https://wa.me/${toWhatsAppPhone(whatsappSettings.whatsappNumber)}` +
        `?text=${encodeURIComponent(
          message
        )}`;

      // =========================
      // CLOSE FORM
      // =========================

      setShowOrderForm(false);

      // =========================
      // RESET FORM
      // =========================

      setOrderForm({
        customerName: "",
        customerPhone: "",
        customerAddress: "",
        quantity: 1,
        notes: "",
      });

      // =========================
      // OPEN WHATSAPP
      // =========================

      if (whatsappWindow) whatsappWindow.location.href = whatsappUrl;
      else window.location.assign(whatsappUrl);
    } catch (error) {
      whatsappWindow?.close();
      console.error(
        "Create Order Error:",
        error
      );

      setOrderError(
        error.response?.data?.message ||
          error.message ||
          "Unable to create order. Please try again."
      );
    } finally {
      setOrderLoading(false);
    }
  };

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Link href="/dashboard" aria-label="Back to shop" className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-300 text-xl font-semibold text-gray-700 hover:bg-gray-50"><span aria-hidden="true">←</span></Link>
          <div className="text-lg font-semibold">
            Loading product...
          </div>

          <p className="mt-2 text-sm text-gray-500">
            Please wait
          </p>
        </div>
      </main>
    );
  }

  // =========================
  // ERROR
  // =========================

  if (error || !product) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <Link href="/dashboard" aria-label="Back to shop" className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-300 text-xl font-semibold text-gray-700 hover:bg-gray-50"><span aria-hidden="true">←</span></Link>
          <h1 className="text-2xl font-bold">
            Product Not Found
          </h1>

          <p className="mt-2 text-gray-500">
            {error ||
              "This product could not be found."}
          </p>
        </div>
      </main>
    );
  }

  // =========================
  // TOTAL
  // =========================

  const productPrice =
    Number(product.price || 0);

  const formQuantity =
    Number(orderForm.quantity || 1);

  const formTotal =
    productPrice * formQuantity;

  const productMedia = [
    ...(product.images || []).map((item) => ({ ...item, type: "image" })),
    ...(product.videos || []).map((item) => ({ ...item, type: "video" })),
    ...(product.video?.url && !(product.videos || []).some((item) => item.url === product.video.url)
      ? [{ ...product.video, type: "video" }]
      : []),
  ];
  const selectedMedia = productMedia[selectedImage] || productMedia[0];

  // =========================
  // PAGE
  // =========================

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-3 py-4 sm:p-6 md:p-10">

        <Link href="/dashboard" aria-label="Back to shop" className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-300 bg-white text-xl font-semibold text-gray-700 shadow-sm hover:bg-gray-50 sm:mb-6">
          <span aria-hidden="true">←</span>
        </Link>

        <div className="grid gap-10 rounded-2xl bg-white p-6 shadow-sm md:grid-cols-2">

          {/* =========================
              IMAGES
          ========================= */}

          <div>
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-gray-100">
              {selectedMedia?.type === "video" ? (
                <video src={selectedMedia.url} controls playsInline className="h-full w-full object-contain" />
              ) : selectedMedia?.url ? (
                <Image src={selectedMedia.url} alt={product.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">
                  No Image
                </div>
              )}
            </div>

            {productMedia.length > 1 && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                {productMedia.map(
                  (media, index) => (
                    <button
                      key={
                      media.publicId ||
                        media.url ||
                        index
                      }
                      type="button"
                      onClick={() =>
                        setSelectedImage(
                          index
                        )
                      }
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 ${
                        selectedImage === index
                          ? "border-black"
                          : "border-transparent"
                      }`}
                    >
                      {media.type === "video" ? <video src={media.url} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <Image src={media.url} alt={`${product.name} ${index + 1}`} fill sizes="(max-width: 640px) 25vw, 128px" className="object-cover" />}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* =========================
              PRODUCT DETAILS
          ========================= */}

          <div className="flex flex-col justify-center">

            <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
              {product.category}
            </p>

            <h1 className="mt-2 text-3xl font-bold md:text-4xl">
              {product.name}
            </h1>

            <div className="mt-6 flex items-center gap-3">
              <span className="text-3xl font-bold">
                Rs.{" "}
                {productPrice.toLocaleString()}
              </span>

              {product.comparePrice >
                product.price && (
                <span className="text-lg text-gray-400 line-through">
                  Rs.{" "}
                  {Number(
                    product.comparePrice
                  ).toLocaleString()}
                </span>
              )}
            </div>

            {/* DESCRIPTION */}

            <div className="mt-6">
              <h2 className="font-semibold">
                Description
              </h2>

              <p className="mt-2 whitespace-pre-line leading-7 text-gray-600">
                {product.description}
              </p>
              {product.tags?.length > 0 && <p className="mt-3 text-sm text-emerald-700">{product.tags.map((tag) => `#${tag}`).join("  ")}</p>}
            </div>

            {/* BUY NOW */}

            <button
              type="button"
              onClick={buyNow}
              disabled={!whatsappSettings.whatsappNumber}
              title={!whatsappSettings.whatsappNumber ? "WhatsApp number is not configured" : undefined}
              className="mt-8 w-full rounded-xl bg-green-600 px-6 py-4 text-lg font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              Buy Now on WhatsApp
            </button>

            <p className="mt-3 text-center text-sm text-gray-500">
              Enter your details and then
              continue to WhatsApp.
            </p>
            <p className="mt-2 text-center text-sm font-medium text-gray-600">For order contact: 03442905070</p>
          </div>
        </div>
      </div>

      {/* ==================================================
          ORDER FORM MODAL
      ================================================== */}

      {showOrderForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">

            {/* HEADER */}

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  Place Order
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {product.name}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowOrderForm(false)
                }
                className="rounded-lg px-3 py-2 text-xl text-gray-500 hover:bg-gray-100"
              >
                ×
              </button>
            </div>

            {/* PRODUCT SUMMARY */}

            <div className="mt-5 rounded-xl bg-gray-50 p-4">

              <div className="flex items-center justify-between">
                <span className="text-gray-600">
                  Price
                </span>

                <span className="font-semibold">
                  Rs.{" "}
                  {productPrice.toLocaleString()}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <span className="text-gray-600">
                  Quantity
                </span>

                <span className="font-semibold">
                  {orderForm.quantity}
                </span>
              </div>

              <div className="mt-3 border-t pt-3">

                <div className="flex items-center justify-between">

                  <span className="font-semibold">
                    Total
                  </span>

                  <span className="text-xl font-bold">
                    Rs.{" "}
                    {formTotal.toLocaleString()}
                  </span>

                </div>

              </div>
            </div>

            {/* ERROR */}

            {orderError && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {orderError}
              </div>
            )}

            {/* FORM */}

            <form
              onSubmit={submitOrder}
              className="mt-5 space-y-4"
            >

              {/* NAME */}

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Customer Name *
                </label>

                <input
                  type="text"
                  name="customerName"
                  value={
                    orderForm.customerName
                  }
                  onChange={
                    handleInputChange
                  }
                  placeholder="Enter your name"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                  required
                />
              </div>

              {/* PHONE */}

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Phone Number *
                </label>

                <input
                  type="tel"
                  name="customerPhone"
                  value={
                    orderForm.customerPhone
                  }
                  onChange={
                    handleInputChange
                  }
                  placeholder="03XXXXXXXXX"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                  required
                />
              </div>

              {/* ADDRESS */}

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Delivery Address *
                </label>

                <textarea
                  name="customerAddress"
                  value={
                    orderForm.customerAddress
                  }
                  onChange={
                    handleInputChange
                  }
                  placeholder="Enter complete delivery address"
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                  required
                />
              </div>

              {/* QUANTITY */}

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Quantity
                </label>

                <input
                  type="number"
                  name="quantity"
                  min="1"
                  step="1"
                  max={100}
                  value={
                    orderForm.quantity
                  }
                  onChange={
                    handleInputChange
                  }
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                />
              </div>

              {/* NOTES */}

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Notes
                </label>

                <textarea
                  name="notes"
                  value={
                    orderForm.notes
                  }
                  onChange={
                    handleInputChange
                  }
                  placeholder="Optional"
                  rows={2}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
                />
              </div>

              {/* SUBMIT */}

              <button
                type="submit"
                disabled={orderLoading}
                className="w-full rounded-xl bg-green-600 px-6 py-4 text-lg font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {orderLoading
                  ? "Creating Order..."
                  : "Continue to WhatsApp"}
              </button>

            </form>

            <p className="mt-3 text-center text-xs text-gray-500">
              Your order will be saved and
              you will be redirected to
              WhatsApp.
            </p>

          </div>
        </div>
      )}
    </main>
  );
}
