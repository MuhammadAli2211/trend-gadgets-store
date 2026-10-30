"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import api from "../../lib/api";
import { getProductCategoryList, normalizeProductCategory } from "../../lib/productCategories";
import { toWhatsAppPhone } from "../../lib/phone";

const formatPrice = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-PK")}`;

const CART_STORAGE_KEY = "cart2door-cart";
const CART_CHANGE_EVENT = "cart2door-cart-change";
const getCartSnapshot = () => {
  try { return window.localStorage.getItem(CART_STORAGE_KEY) || "[]"; } catch { return "[]"; }
};
const getServerCartSnapshot = () => "[]";
const subscribeToCart = (onChange) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(CART_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CART_CHANGE_EVENT, onChange);
  };
};
const parseCartSnapshot = (snapshot) => {
  try {
    const items = JSON.parse(snapshot);
    return Array.isArray(items) ? items.filter((item) => item && typeof item._id === "string" && Number.isSafeInteger(item.quantity) && item.quantity > 0) : [];
  } catch { return []; }
};

export default function Storefront() {
  const [products, setProducts] = useState([]);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const cartSnapshot = useSyncExternalStore(subscribeToCart, getCartSnapshot, getServerCartSnapshot);
  const cart = useMemo(() => parseCartSnapshot(cartSnapshot), [cartSnapshot]);
  const setCart = useCallback((update) => {
    const currentItems = parseCartSnapshot(getCartSnapshot());
    const nextItems = typeof update === "function" ? update(currentItems) : update;
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextItems));
      window.dispatchEvent(new Event(CART_CHANGE_EVENT));
    } catch {}
  }, []);
  const [showCart, setShowCart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refreshProducts = async () => {
      const [productsResult, settingsResult] = await Promise.allSettled([
        api.get("/public/products"),
        api.get("/public/settings/whatsapp"),
      ]);
      if (!active) return;
      if (productsResult.status === "fulfilled") {
        const data = productsResult.value.data;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setError("");
      } else {
        setError(productsResult.reason?.response?.data?.message || "Products are temporarily unavailable.");
      }
      if (settingsResult.status === "fulfilled") {
        setWhatsappNumber(settingsResult.value.data?.settings?.whatsappNumber || "");
      }
      setLoading(false);
    };

    refreshProducts();
    window.addEventListener("focus", refreshProducts);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshProducts);
    };
  }, []);

  const categories = useMemo(() => {
    return getProductCategoryList(products).filter((item) => products.some((product) => normalizeProductCategory(product.category) === item));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "all" || normalizeProductCategory(product.category) === category;
      const matchesSearch = !query || [product.name, product.category, product.description]
        .some((value) => String(value || "").toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [products, search, category]);

  const addToCart = (product) => {
    setCart((items) => {
      const existing = items.find((item) => item._id === product._id);
      return existing
        ? items.map((item) => item._id === product._id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...items, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId, change) => {
    setCart((items) => items
      .map((item) => item._id === productId ? { ...item, quantity: item.quantity + change } : item)
      .filter((item) => item.quantity > 0));
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);

  const checkoutOnWhatsApp = () => {
    const phone = toWhatsAppPhone(whatsappNumber);
    if (!phone || cart.length === 0) return;
    const orderLines = cart.map((item) => {
      const productUrl = `${window.location.origin}/product/${item._id}`;
      const imageUrl = item.images?.[0]?.url;
      return [
        `• ${item.name} × ${item.quantity} — ${formatPrice(item.price * item.quantity)}`,
        `  Product: ${productUrl}`,
        imageUrl ? `  Product image: ${imageUrl}` : "",
      ].filter(Boolean).join("\n");
    });
    const message = [
      "Assalam o Alaikum, mujhe yeh items order karne hain:",
      ...orderLines,
      `Total: ${formatPrice(cartTotal)}`,
      `Store: ${window.location.origin}`,
    ].join("\n");
    const target = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(target, "_blank", "noopener,noreferrer");
    cart.forEach((item) => api.post("/public/tracking/whatsapp", {
      productId: item._id, source: "storefront-cart", platform: "website",
    }).catch(() => {}));
  };

  const buyNowOnWhatsApp = (product) => {
    const phone = toWhatsAppPhone(whatsappNumber);
    if (!phone) return;
    const productUrl = `${window.location.origin}/product/${product._id}`;
    const message = [
      "Assalam o Alaikum, mujhe yeh product order karna hai:",
      product.name,
      `Price: ${formatPrice(product.price)}`,
      `Product link: ${productUrl}`,
      product.images?.[0]?.url ? `Product image: ${product.images[0].url}` : "",
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    api.post("/public/tracking/whatsapp", {
      productId: product._id, source: "storefront-buy-now", platform: "website",
    }).catch(() => {});
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="hidden bg-emerald-800 px-3 py-1.5 text-center text-xs font-medium text-white sm:block">Easy ordering · Direct WhatsApp support</div>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Image src="/logo.png" alt="Trend Gadgets & Toys" width={56} height={56} sizes="56px" className="h-11 w-11 shrink-0 rounded-full object-cover sm:h-14 sm:w-14" />
            <span>
              <span className="block truncate text-sm font-bold leading-tight sm:text-lg">Trend Gadgets & Toys</span>
              <span className="hidden text-xs text-slate-500 min-[360px]:block">Shop the best toys</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <a href="#products" className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:inline-flex">Browse products</a>
            <button type="button" onClick={() => setShowCart(true)} className="rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 sm:px-4 sm:text-sm"><span aria-hidden="true">🛒 </span>Cart <span className="ml-1 rounded-full bg-white/15 px-1.5 py-0.5">{cartCount}</span></button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-3 pb-8 pt-2 sm:px-6 sm:pt-7">
        <div className="relative hidden overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-50 via-white to-amber-50 px-5 py-6 sm:block sm:px-8 sm:py-8">
          <div className="relative z-10 max-w-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 sm:text-xs">Welcome to our store</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Good finds, easy ordering.</h1>
            <p className="mt-2 max-w-lg text-sm leading-5 text-slate-600">Explore products, add to cart, or order directly on WhatsApp.</p>
            <a href="#products" className="mt-4 inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">Shop products <span className="ml-2" aria-hidden="true">↓</span></a>
          </div>
          <div aria-hidden="true" className="absolute -right-6 -top-12 hidden h-64 w-64 rounded-full border-[28px] border-emerald-100 sm:block" />
          <div aria-hidden="true" className="absolute right-12 top-10 hidden h-28 w-28 rounded-full bg-amber-100/80 sm:block" />
        </div>

        <section id="products" className="scroll-mt-20 pt-3 sm:scroll-mt-32 sm:pt-9">
          <div className="mb-2 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold sm:text-2xl">Shop toys & gadgets</h2>
              <p className="hidden text-sm text-slate-500 sm:mt-1 sm:block">{loading ? "Loading products…" : `${filteredProducts.length} products`}</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <label className="sr-only" htmlFor="product-search">Search products</label>
              <input
                id="product-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products"
                className="min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 sm:w-64 sm:px-4 sm:py-2.5"
              />
            </div>
          </div>

          <nav aria-label="Product categories" className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1 sm:mb-5 sm:pb-2">
            {[{ id: "all", label: "Home · All products" }, ...categories.map((item) => ({ id: item, label: item }))].map((item) => (
              <button key={item.id} type="button" onClick={() => setCategory(item.id)} aria-pressed={category === item.id} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition sm:px-4 sm:py-2.5 sm:text-sm ${category === item.id ? "bg-emerald-700 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-500"}`}>
                {item.label}
              </button>
            ))}
          </nav>

          {loading ? (
            <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">Loading products…</div>
          ) : error ? (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">{error}</div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl border bg-white p-10 text-center">
              <p className="font-semibold">No products found</p>
              <p className="mt-1 text-sm text-slate-500">Try another search or category.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => {
                const image = product.images?.[0]?.url;
                return (
                  <article key={product._id} className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:rounded-2xl">
                    <Link href={`/product/${product._id}`} className="block">
                      <div className="relative aspect-square overflow-hidden bg-slate-100">
                        {image ? <Image src={image} alt={product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw" className="object-cover transition duration-300 group-hover:scale-[1.03]" /> : product.video?.url ? <video src={product.video.url} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-slate-400">No image available</div>}
                      </div>
                    </Link>
                    <div className="flex flex-1 flex-col p-2.5 sm:p-4">
                      <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{normalizeProductCategory(product.category)}</p>
                      <Link href={`/product/${product._id}`} className="mt-1 line-clamp-2 min-h-10 text-xs font-semibold leading-5 text-slate-900 hover:text-emerald-700 sm:min-h-12 sm:text-base">{product.name}</Link>
                      {product.description && <p className="mt-1 line-clamp-1 text-[10px] text-slate-500 sm:mt-2 sm:line-clamp-2 sm:text-sm">{product.description}</p>}
                      <div className="mt-auto flex items-end justify-between gap-2 pt-3 sm:gap-3 sm:pt-4">
                        <div>
                          <p className="text-sm font-bold sm:text-xl">{formatPrice(product.price)}</p>
                          {Number(product.comparePrice) > Number(product.price) && <p className="text-xs text-slate-400 line-through">{formatPrice(product.comparePrice)}</p>}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-1.5 min-[390px]:grid-cols-2 sm:mt-4 sm:gap-2">
                        <button type="button" onClick={() => buyNowOnWhatsApp(product)} disabled={!whatsappNumber} title={!whatsappNumber ? "WhatsApp number is not configured" : undefined} className="rounded-lg border border-emerald-600 px-2 py-2 text-center text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-sm">Buy Now</button>
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          className="rounded-lg bg-emerald-600 px-2 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-sm"
                        >
                          Add to cart
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <footer className="mt-10 border-t bg-white px-4 py-6 text-center text-sm text-slate-500">Trend Gadgets & Toys · Add products to your cart and send your order through WhatsApp.</footer>

      {showCart && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCart(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="cart-title" className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b px-5 py-4">
              <div><h2 id="cart-title" className="text-xl font-bold">Your cart</h2><p className="text-sm text-slate-500">{cartCount} item{cartCount === 1 ? "" : "s"}</p></div>
              <button type="button" onClick={() => setShowCart(false)} aria-label="Close cart" className="rounded-lg p-2 text-2xl leading-none text-slate-500 hover:bg-slate-100">×</button>
            </header>
            {cart.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center"><p className="text-lg font-semibold">Your cart is empty</p><p className="mt-1 text-sm text-slate-500">Add a product to start your order.</p><button type="button" onClick={() => setShowCart(false)} className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white">Browse products</button></div>
            ) : (
              <>
                <ul className="flex-1 divide-y overflow-y-auto px-5">
                  {cart.map((item) => (
                    <li key={item._id} className="flex gap-3 py-4">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">{item.images?.[0]?.url ? <Image src={item.images[0].url} alt={item.name} fill sizes="80px" className="object-cover" /> : item.video?.url ? <video src={item.video.url} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : null}</div>
                      <div className="min-w-0 flex-1"><p className="line-clamp-2 font-semibold">{item.name}</p><p className="mt-1 text-sm text-slate-500">{formatPrice(item.price)}</p><div className="mt-2 flex items-center gap-3"><button type="button" onClick={() => updateQuantity(item._id, -1)} aria-label={`Remove one ${item.name}`} className="h-8 w-8 rounded-lg border text-lg">−</button><span className="min-w-4 text-center text-sm font-semibold">{item.quantity}</span><button type="button" onClick={() => updateQuantity(item._id, 1)} aria-label={`Add one ${item.name}`} className="h-8 w-8 rounded-lg border text-lg">+</button><button type="button" onClick={() => setCart((items) => items.filter((entry) => entry._id !== item._id))} className="ml-auto text-sm font-medium text-red-600">Remove</button></div></div>
                    </li>
                  ))}
                </ul>
                <div className="border-t p-5"><div className="mb-4 flex justify-between text-lg font-bold"><span>Total</span><span>{formatPrice(cartTotal)}</span></div><button type="button" onClick={checkoutOnWhatsApp} disabled={!whatsappNumber} title={!whatsappNumber ? "WhatsApp number is not configured" : undefined} className="w-full rounded-xl bg-emerald-600 px-4 py-3.5 font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">{whatsappNumber ? "Order on WhatsApp" : "WhatsApp not configured"}</button><p className="mt-2 text-center text-xs text-slate-500">Your items and total will be sent in the WhatsApp chat.</p></div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
